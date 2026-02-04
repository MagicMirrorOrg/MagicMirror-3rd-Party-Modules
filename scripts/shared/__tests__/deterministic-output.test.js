/* eslint-disable id-length */
import {
  createDeterministicImageName,
  sortObjectKeys,
  stringifyDeterministic
} from "../deterministic-output.js";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("deterministic-output", () => {
  describe("sortObjectKeys", () => {
    it("should sort object keys alphabetically", () => {
      const input = { z: 1, a: 2, m: 3 };
      const result = sortObjectKeys(input);

      assert.deepStrictEqual(Object.keys(result), ["a", "m", "z"]);
      assert.deepStrictEqual(result, { a: 2, m: 3, z: 1 });
    });

    it("should recursively sort nested objects", () => {
      const input = {
        z: { y: 1, a: 2 },
        a: { c: 3, b: 4 }
      };
      const result = sortObjectKeys(input);

      assert.deepStrictEqual(Object.keys(result), ["a", "z"]);
      assert.deepStrictEqual(Object.keys(result.a), ["b", "c"]);
      assert.deepStrictEqual(Object.keys(result.z), ["a", "y"]);
    });

    it("should handle arrays without changing order", () => {
      const input = { z: [3, 1, 2], a: [6, 5, 4] };
      const result = sortObjectKeys(input);

      assert.deepStrictEqual(result, { a: [6, 5, 4], z: [3, 1, 2] });
    });

    it("should handle primitives", () => {
      assert.strictEqual(sortObjectKeys(null), null);
      assert.strictEqual(sortObjectKeys(42), 42);
      assert.strictEqual(sortObjectKeys("hello"), "hello");
      assert.strictEqual(sortObjectKeys(true), true);
    });

    it("should handle arrays of objects", () => {
      const input = [{ z: 1, a: 2 }, { y: 3, b: 4 }];
      const result = sortObjectKeys(input);

      assert.deepStrictEqual(Object.keys(result[0]), ["a", "z"]);
      assert.deepStrictEqual(Object.keys(result[1]), ["b", "y"]);
    });
  });

  describe("stringifyDeterministic", () => {
    it("should produce sorted JSON output", () => {
      const input = { z: 1, a: 2, m: 3 };
      const result = stringifyDeterministic(input, 0);

      assert.strictEqual(result, "{\"a\":2,\"m\":3,\"z\":1}");
    });

    it("should support pretty printing", () => {
      const input = { z: 1, a: 2 };
      const result = stringifyDeterministic(input, 2);

      assert.strictEqual(result, "{\n  \"a\": 2,\n  \"z\": 1\n}");
    });

    it("should produce deterministic output for complex objects", () => {
      const input = {
        name: "MMM-Test",
        metadata: { version: "1.0", author: "test" },
        tags: ["weather", "calendar"]
      };

      const result1 = stringifyDeterministic(input);
      const result2 = stringifyDeterministic(input);

      assert.strictEqual(result1, result2);

      // Verify order is deterministic
      assert.ok(result1.indexOf("metadata") < result1.indexOf("name"));
      assert.ok(result1.indexOf("author") < result1.indexOf("version"));
    });
  });

  describe("createDeterministicImageName", () => {
    it("should create deterministic filename from module name and maintainer", () => {
      const name1 = createDeterministicImageName("MMM-Weather", "example", "jpg");
      const name2 = createDeterministicImageName("MMM-Weather", "example", "jpg");

      assert.strictEqual(name1, name2);
      assert.strictEqual(name1, "MMM-Weather---example.jpg");
    });

    it("should create different filenames for different modules", () => {
      const name1 = createDeterministicImageName("MMM-Weather", "example", "jpg");
      const name2 = createDeterministicImageName("MMM-Calendar", "example", "jpg");

      assert.notStrictEqual(name1, name2);
      assert.strictEqual(name1, "MMM-Weather---example.jpg");
      assert.strictEqual(name2, "MMM-Calendar---example.jpg");
    });

    it("should create different filenames for different maintainers", () => {
      const name1 = createDeterministicImageName("MMM-Weather", "alice", "jpg");
      const name2 = createDeterministicImageName("MMM-Weather", "bob", "jpg");

      assert.notStrictEqual(name1, name2);
      assert.strictEqual(name1, "MMM-Weather---alice.jpg");
      assert.strictEqual(name2, "MMM-Weather---bob.jpg");
    });

    it("should respect custom extension", () => {
      const name = createDeterministicImageName("MMM-Test", "example", "png");

      assert.strictEqual(name, "MMM-Test---example.png");
    });

    it("should use default webp extension", () => {
      const name = createDeterministicImageName("MMM-Test", "example");

      assert.strictEqual(name, "MMM-Test---example.webp");
    });

    it("should be human-readable", () => {
      const name = createDeterministicImageName("MMM-MyModule", "john-doe", "jpg");

      // Should contain the module name and maintainer
      assert.ok(name.includes("MMM-MyModule"));
      assert.ok(name.includes("john-doe"));
      assert.strictEqual(name, "MMM-MyModule---john-doe.jpg");
    });
  });
});
