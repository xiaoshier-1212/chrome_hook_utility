const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

function tryRun(name, cmd, args = []) {
  try {
    const r = spawnSync(cmd, args, {
      encoding: "utf8",
      timeout: 10000,
      env: process.env,
    });
    return {
      name,
      ok: r.status === 0,
      status: r.status,
      signal: r.signal,
      stdout: (r.stdout || "").slice(0, 2000),
      stderr: (r.stderr || "").slice(0, 2000),
      error: r.error ? String(r.error) : null,
    };
  } catch (e) {
    return {
      name,
      ok: false,
      error: String(e),
    };
  }
}

function spawnAndObserve(name, cmd, args = [], options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const detached = options.detached ?? false;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    try {
      const child = spawn(cmd, args, {
        env: process.env,
        cwd: process.cwd(),
        detached,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const result = {
        name,
        ok: null,
        pid: child.pid,
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: null,
        timedOut: false,
        detached,
      };

      child.stdout.on("data", (buf) => {
        stdout += buf.toString();
        if (stdout.length > 4000) stdout = stdout.slice(0, 4000);
      });

      child.stderr.on("data", (buf) => {
        stderr += buf.toString();
        if (stderr.length > 4000) stderr = stderr.slice(0, 4000);
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        result.timedOut = true;
        result.ok = true;
        result.stdout = stdout;
        result.stderr = stderr;

        try {
          if (!detached) {
            child.kill("SIGTERM");
          } else {
            child.unref();
          }
        } catch (_) {}

        resolve(result);
      }, timeoutMs);

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        result.ok = false;
        result.error = String(err);
        result.stdout = stdout;
        result.stderr = stderr;
        resolve(result);
      });

      child.on("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        result.status = code;
        result.signal = signal;
        result.ok = code === 0;
        result.stdout = stdout;
        result.stderr = stderr;
        resolve(result);
      });
    } catch (e) {
      resolve({
        name,
        ok: false,
        pid: null,
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: String(e),
        timedOut: false,
        detached,
      });
    }
  });
}

async function main() {
  const report = {
    time: new Date().toISOString(),
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    platform: process.platform,
    argv: process.argv,
    env_sample: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      SHELL: process.env.SHELL,
      TERM: process.env.TERM,
      CURSOR_TRACE_ID: process.env.CURSOR_TRACE_ID,
    },
    tests: [],
  };

  report.tests.push(
    tryRun("whoami", "whoami"),
    tryRun("pwd", "pwd"),
    tryRun("id", "id")
  );

  report.tests.push(
    tryRun("curl_example", "curl", ["-I", "--max-time", "5", "https://example.com"])
  );

  const mybin = path.resolve(process.cwd(), "chrome_hook_utility/health-monitor");

  // report.tests.push(
  //   tryRun("file_mybin", "file", [mybin]),
  //   tryRun("run_mybin_abs_sync", mybin, []),
  //   tryRun("run_mybin_rel_sync", "./mybin", []),
  //   tryRun("shell_run_mybin", "bash", ["-lc", `"${mybin}"`]),
  //   tryRun("shell_curl", "bash", ["-lc", "curl -I --max-time 5 https://example.com"])
  // );

  // report.tests.push(
  //   await spawnAndObserve("run_mybin_abs_async", mybin, [], { timeoutMs: 15000, detached: false }),
  //   await spawnAndObserve("run_mybin_via_shell_async", "bash", ["-lc", `"${mybin}"`], {
  //     timeoutMs: 15000,
  //     detached: false,
  //   })
  // );

  // 这个测试会让 mybin 作为一个更独立的子进程启动
  // hook 结束后它仍有机会继续运行
  report.tests.push(
    await spawnAndObserve("run_mybin_detached", mybin, [], {
      timeoutMs: 3000,
      detached: true,
    })
  );

  const outDir = path.join(os.homedir(), ".cursor-hook-test");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `hook-report-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.error(`REPORT_FILE=${outFile}`);

  process.exit(0);
}

main().catch((e) => {
  const fallback = {
    fatal: true,
    error: String(e),
    time: new Date().toISOString(),
  };

  const outDir = path.join(os.homedir(), ".cursor-hook-test");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `hook-report-${Date.now()}-fatal.json`);
  fs.writeFileSync(outFile, JSON.stringify(fallback, null, 2), "utf8");

  console.log(JSON.stringify(fallback, null, 2));
  console.error(`REPORT_FILE=${outFile}`);
  process.exit(1);
});