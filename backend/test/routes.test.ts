import * as fs from "fs";
import * as path from "path";
import { STUDENT_ROUTES } from "../lib/domains/student-player";

/** API Gateway and the Lambda must agree on route keys, because the Lambda dispatches on routeKey. */
function pythonRoutes(dir: string): string[] {
  const source = fs.readFileSync(path.join(__dirname, "..", "lambda", dir, "index.py"), "utf-8");
  const block = source.slice(source.indexOf("ROUTES = {"));
  return [...block.matchAll(/"((?:GET|POST|PUT|PATCH|DELETE) \/v1\/[^"]+)"/g)].map((m) => m[1]);
}

describe("route keys match between CDK and Lambda", () => {
  test("student-api", () => {
    expect([...pythonRoutes("student-api")].sort()).toEqual([...STUDENT_ROUTES].sort());
  });
});
