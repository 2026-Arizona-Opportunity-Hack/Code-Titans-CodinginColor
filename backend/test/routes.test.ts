import * as fs from "fs";
import * as path from "path";
import { READ_ROUTES } from "../lib/domains/read";
import { REPORTS_ROUTES } from "../lib/domains/reports";
import { STUDENT_ROUTES } from "../lib/domains/student-player";

/** API Gateway and the Lambda must agree on route keys, because the Lambda dispatches on routeKey. */
function pythonRoutes(dir: string): string[] {
  const source = fs.readFileSync(path.join(__dirname, "..", "lambda", dir, "index.py"), "utf-8");
  const block = source.slice(source.indexOf("ROUTES = {"));
  return [...block.matchAll(/"((?:GET|POST|PUT|PATCH|DELETE) \/v1\/[^"]+)"/g)].map((m) => m[1]);
}

describe("route keys match between CDK and Lambda", () => {
  test("read-api", () => {
    expect([...pythonRoutes("read-api")].sort()).toEqual([...READ_ROUTES].sort());
  });

  test("reports-api", () => {
    expect([...pythonRoutes("reports-api")].sort()).toEqual([...REPORTS_ROUTES].sort());
  });

  test("student-api", () => {
    expect([...pythonRoutes("student-api")].sort()).toEqual([...STUDENT_ROUTES].sort());
  });
});
