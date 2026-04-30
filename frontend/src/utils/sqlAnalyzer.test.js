import test from "node:test";
import assert from "node:assert/strict";
import { parseCreateTable, splitStatements } from "./sqlAnalyzer.js";

test("splitStatements ignores semicolons inside strings and comments", () => {
  const statements = splitStatements(`
    SELECT ';' AS semi;
    -- this comment has a ; character
    SELECT 'it''s; ok' AS quoted;
    /* block ; comment */
    SELECT 3
  `);

  assert.equal(statements.length, 3);
  assert.match(statements[0], /SELECT ';'/);
  assert.match(statements[1], /SELECT 'it''s; ok'/);
  assert.match(statements[2], /SELECT 3/);
});

test("parseCreateTable supports quoted identifiers and composite keys", () => {
  const schema = parseCreateTable(`
    CREATE TABLE "school"."enrollment" (
      "student id" INTEGER,
      course_id INTEGER,
      status VARCHAR(20) DEFAULT 'active',
      CONSTRAINT pk_enrollment PRIMARY KEY ("student id", course_id),
      CONSTRAINT fk_enrollment_student
        FOREIGN KEY ("student id", course_id)
        REFERENCES "student archive"(id, course_id)
    );
  `);

  assert.equal(schema.tableName, "school.enrollment");
  assert.equal(schema.columns.length, 3);

  const studentId = schema.columns.find(col => col.name === "student id");
  const courseId = schema.columns.find(col => col.name === "course_id");
  const status = schema.columns.find(col => col.name === "status");

  assert.equal(studentId.pk, true);
  assert.equal(studentId.fk, true);
  assert.equal(studentId.refTable, "student archive");
  assert.equal(studentId.refColumn, "id");

  assert.equal(courseId.pk, true);
  assert.equal(courseId.fk, true);
  assert.equal(courseId.refColumn, "course_id");

  assert.equal(status.type, "VARCHAR(20)");
  assert.equal(status.default, "'active'");
});
