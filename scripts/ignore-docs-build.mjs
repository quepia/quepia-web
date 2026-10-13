import { execFileSync } from "node:child_process"

// Vercel: 0 skips, 1 builds. Compare with the previous deployed commit,
// not HEAD^: a documentation commit can follow an undeployed code change.
try {
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA
  const current = process.env.VERCEL_GIT_COMMIT_SHA
  if (!previous || !current) process.exit(1)
  const files = execFileSync("git", ["diff", "--name-only", "-z", previous, current], { encoding: "utf8" })
    .split("\0").filter(Boolean)
  process.exit(files.every(file => file.startsWith("docs/") || file === "README.md") ? 0 : 1)
} catch {
  process.exit(1)
}
