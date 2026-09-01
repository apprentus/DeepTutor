import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ENCORE_ADMIN_ONLY_NAV,
  ENCORE_USER_SETTINGS_HREF,
  encoreBlockedRedirect,
  isEncoreAdminOnlyNavHref,
  isEncoreAdminOnlyPath,
  isEncoreUserSettingsPath,
} from "../lib/encore-admin-nav";

test("encore admin nav: Settings stays in the sidebar for everyone", () => {
  assert.equal(isEncoreAdminOnlyNavHref("/settings"), false);
  assert.ok(!(ENCORE_ADMIN_ONLY_NAV as readonly string[]).includes("/settings"));
});

test("encore admin nav: non-admins may open Appearance only", () => {
  assert.equal(isEncoreUserSettingsPath("/settings/appearance"), true);
  assert.equal(isEncoreAdminOnlyPath("/settings/appearance"), false);

  assert.equal(isEncoreUserSettingsPath("/settings"), false);
  assert.equal(isEncoreAdminOnlyPath("/settings"), true);
  assert.equal(isEncoreAdminOnlyPath("/settings/network"), true);
  assert.equal(isEncoreAdminOnlyPath("/settings/about"), true);
});

test("encore admin nav: blocked settings routes bounce to Appearance", () => {
  assert.equal(encoreBlockedRedirect("/settings"), ENCORE_USER_SETTINGS_HREF);
  assert.equal(
    encoreBlockedRedirect("/settings/network"),
    ENCORE_USER_SETTINGS_HREF,
  );
  assert.equal(encoreBlockedRedirect("/knowledge"), "/home");
});

test("encore admin nav: other consoles stay admin-only", () => {
  assert.equal(isEncoreAdminOnlyNavHref("/knowledge"), true);
  assert.equal(isEncoreAdminOnlyPath("/partners"), true);
  assert.equal(isEncoreAdminOnlyPath("/home"), false);
});

test("encore settings shell: hides the full settings navigator for non-admins", () => {
  const source = readFileSync(
    path.join(process.cwd(), "components", "settings", "SettingsMain.tsx"),
    "utf8",
  );
  assert.match(source, /showEncoreAdminNav/);
  assert.match(source, /showSettingsNav \?/);
  assert.match(source, /<SettingsNav \/>/);
  assert.match(source, /<SettingsNavCompact \/>/);
});
