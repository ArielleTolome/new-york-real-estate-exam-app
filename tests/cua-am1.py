#!/usr/bin/env python3
"""CUA Driver tier: drives the live app in Safari through one persistent `cua-driver mcp` session.

Run on a fleet Mac whose CuaDriver.app has Accessibility (e.g. `scp` to am1, then
`python3 cua-am1.py <safari_pid>`). Audits AX roles/labels/tap targets and clicks
through a 10-question study drill using snapshot-bound element tokens only.
"""
import json, os, re, subprocess, sys, time

PID = int(sys.argv[1])
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/nyre-cua"
os.makedirs(OUT, exist_ok=True)
ACTIONABLE = {"AXButton", "AXLink", "AXRadioButton", "AXCheckBox", "AXTextField", "AXIncrementor", "AXPopUpButton", "AXDisclosureTriangle"}

proc = subprocess.Popen(["cua-driver", "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
_id = 0


def rpc(method, params=None, notify=False):
    global _id
    msg = {"jsonrpc": "2.0", "method": method, "params": params or {}}
    if not notify:
        _id += 1
        msg["id"] = _id
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    if notify:
        return None
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("cua-driver mcp exited")
        resp = json.loads(line)
        if resp.get("id") == _id:
            if "error" in resp:
                raise RuntimeError(resp["error"])
            return resp["result"]


def tool(name, **args):
    res = rpc("tools/call", {"name": name, "arguments": {"session": f"nyre-{os.getpid()}", **args}})
    if res.get("isError"):
        raise RuntimeError(f"{name}: {res['content'][0].get('text', '')[:300]}")
    return res.get("structuredContent") or json.loads(res["content"][0]["text"])


rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "nyre-qa", "version": "1"}})
rpc("notifications/initialized", notify=True)

win = None
for _ in range(20):
    wins = [w for w in tool("list_windows", pid=PID)["windows"] if "Real Estate" in (w.get("title") or "")]
    if wins:
        win = wins[0]["window_id"]
        break
    time.sleep(1)
assert win, "app window not found"
try:
    tool("set_window_frame", pid=PID, window_id=win, x=40, y=40, width=430, height=932)
except RuntimeError as e:
    print("resize skipped:", e)

state = {}


def snap(shot=None):
    args = dict(pid=PID, window_id=win, timeout_ms=8000, include_screenshot=bool(shot))
    if shot:
        args["screenshot_out_file"] = f"{OUT}/{shot}.png"
    s = tool("get_window_state", **args)
    state["els"] = s.get("elements", [])
    return state["els"]


def find(role, pattern):
    rx = re.compile(pattern)
    for e in state["els"]:
        if e["role"] == role and rx.search(e.get("label") or e.get("value") or ""):
            return e
    return None


def text_present(pattern):
    rx = re.compile(pattern)
    return any(rx.search(e.get(k) or "") for e in state["els"] for k in ("label", "value"))


def click(role, pattern):
    e = find(role, pattern)
    assert e, f"no {role} matching {pattern}"
    tool("click", pid=PID, element_token=e["element_token"])
    return e


def wait_for(pattern, shot=None, timeout=8):
    end = time.time() + timeout
    while time.time() < end:
        snap()
        if text_present(pattern):
            if shot:
                snap(shot)
            return True
        time.sleep(0.4)
    raise AssertionError(f"timed out waiting for {pattern}")


def audit(screen):
    # Only the app's page content; Safari chrome/banners are not ours to audit.
    web = [e for e in state["els"] if e["role"] in ACTIONABLE and e.get("in_web_content")]
    assert web, f"{screen}: no page controls found in the AX tree"
    issues = []
    for e in web:
        label = (e.get("label") or "").strip()
        h = e.get("frame", {}).get("h", 0)
        if not label:
            issues.append(f"{e['role']} #{e['element_index']} unlabeled")
        if 0 < h < 44:
            issues.append(f"{e['role']} '{label[:30]}' tap target {h}pt")
    return {"screen": screen, "controls": len(web), "roles": sorted({e["role"] for e in web}), "issues": issues}


report = {"window_id": win, "audits": [], "flow": []}
snap()
if not text_present(r"Quick 10-Question Drill"):
    click("AXLink", r"^Home$")
wait_for(r"Quick 10-Question Drill", shot="01-home")
report["audits"].append(audit("home"))
click("AXButton", r"^Quick 10-Question Drill$")
wait_for(r"Q 1 of 10", shot="02-quiz")
report["audits"].append(audit("quiz-study"))
for q in range(1, 11):
    opt = click("AXRadioButton", r"^A ")
    wait_for(r"Legal Citation & Rationale", shot="03-answered" if q == 1 else None)
    verdict = "Incorrect" if text_present(r"^Incorrect") else "Correct" if text_present(r"^Correct$") else "?"
    report["flow"].append(f"Q{q}: {(opt.get('label') or '')[2:50]}… -> {verdict}")
    if q == 1:
        report["audits"].append(audit("quiz-study-answered"))
    if q < 10:
        click("AXButton", r"^Next$")
        wait_for(rf"Q {q + 1} of 10")
click("AXButton", r"^Finish$")
wait_for(r"^(PASS|FAIL)$", shot="04-results")
report["result"] = [e.get("value") or e.get("label") for e in state["els"] if re.search(r"^(PASS|FAIL|\d+%)$|correct ·", (e.get("value") or e.get("label") or ""))]
report["audits"].append(audit("results"))
click("AXLink", r"^Home$")
for i, (tab, marker) in enumerate([("Stats", r"Weak topic heatmap"), ("Mistakes", r"Review mistakes"), ("Build", r"Shuffle question order")]):
    wait_for(rf"^{tab}$")
    click("AXLink", rf"^{tab}$")
    wait_for(marker, shot=f"0{5 + i}-{tab.lower()}")
    report["audits"].append(audit(tab.lower()))
proc.terminate()
print(json.dumps(report, indent=2))
sys.exit(1 if any(a["issues"] for a in report["audits"]) else 0)
