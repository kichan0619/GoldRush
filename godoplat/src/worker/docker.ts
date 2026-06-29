import { spawn, spawnSync } from "node:child_process";

/** Thin wrapper around the docker CLI. No SDK — keeps deps minimal. */

export interface RunHandle {
  containerName: string;
  /** Resolves with the container exit code once it stops. */
  done: Promise<number>;
  /** Kill the container (used by the wall-clock timeout). */
  kill: () => void;
}

export interface RunOptions {
  image: string;
  containerName: string;
  env: Record<string, string>;
  memory: string;
  cpus: string;
  pidsLimit: number;
  /** Optional read-only host dir to mount at a container path (edit-mode seed). */
  readonlyMount?: { hostPath: string; containerPath: string };
  /** Called for every stdout/stderr line the container emits. */
  onLine: (line: string) => void;
}

/**
 * Run a job container in the foreground, streaming its output line-by-line.
 * The container is NOT auto-removed (no --rm) so artifacts can be copied out
 * after it exits; the caller removes it explicitly.
 *
 * Security: network is left on the default bridge here for the slice; the
 * plan calls for an egress allowlist network (see README). Never pass
 * --privileged. Host secrets are passed as -e env vars only, never mounted.
 */
export function runContainer(opts: RunOptions): RunHandle {
  const args = [
    "run",
    "--name",
    opts.containerName,
    "--memory",
    opts.memory,
    "--cpus",
    opts.cpus,
    "--pids-limit",
    String(opts.pidsLimit),
    // Defense-in-depth: drop the ability to gain privileges.
    "--security-opt",
    "no-new-privileges",
  ];
  // Isolate the job from any host-level proxy the Docker daemon injects
  // (e.g. ~/.docker/config.json proxies). The sandbox does its own networking —
  // direct fetches for npm/apt plus the caller's relay — so a stale host proxy
  // must not leak in. Explicit empty values override the daemon-injected ones.
  for (const k of [
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "ALL_PROXY",
  ]) {
    args.push("-e", `${k}=`);
  }
  for (const [k, v] of Object.entries(opts.env)) {
    if (v) args.push("-e", `${k}=${v}`);
  }
  // Edit mode: mount the parent game's source read-only as a seed. :ro keeps the
  // sandbox from mutating host storage.
  if (opts.readonlyMount) {
    args.push("-v", `${opts.readonlyMount.hostPath}:${opts.readonlyMount.containerPath}:ro`);
  }
  args.push(opts.image);

  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });

  const handleData = (buf: Buffer) => {
    for (const line of buf.toString("utf8").split(/\r?\n/)) {
      if (line.length > 0) opts.onLine(line);
    }
  };
  child.stdout.on("data", handleData);
  child.stderr.on("data", handleData);

  const done = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
  });

  return {
    containerName: opts.containerName,
    done,
    kill: () => {
      spawnSync("docker", ["kill", opts.containerName], { stdio: "ignore" });
    },
  };
}

/** Copy a path out of a (stopped) container to the host. Returns success. */
export function copyOut(containerName: string, containerPath: string, hostPath: string): boolean {
  const res = spawnSync("docker", ["cp", `${containerName}:${containerPath}`, hostPath], {
    stdio: "ignore",
  });
  return res.status === 0;
}

/** Force-remove a container (ignore errors — it may already be gone). */
export function removeContainer(containerName: string): void {
  spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
}

/** True if the docker CLI is reachable. */
export function dockerAvailable(): boolean {
  const res = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    stdio: "ignore",
  });
  return res.status === 0;
}
