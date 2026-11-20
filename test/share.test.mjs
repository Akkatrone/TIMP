import { test } from "node:test";
import assert from "node:assert/strict";
import { creationOptions, requestOptions, credentialJSON, hasService, chatRequestId, chatAddress, onThisComputer } from "../js/share.js";

const b64 = s => Buffer.from(s).toString("base64url");

test("passkey options from the service become what the browser takes, and back", () => {
  const c = creationOptions({challenge: b64("chal"), rp: {id: "frafal.github.io", name: "TIMP"}, user: {id: b64("user-1"), name: "fra", displayName: "fra"},
    pubKeyCredParams: [{type: "public-key", alg: -7}], excludeCredentials: [{type: "public-key", id: b64("old")}]});
  assert.equal(Buffer.from(c.challenge).toString(), "chal");
  assert.equal(Buffer.from(c.user.id).toString(), "user-1");
  assert.equal(Buffer.from(c.excludeCredentials[0].id).toString(), "old");
  assert.equal(c.rp.id, "frafal.github.io");
  const r = requestOptions({challenge: b64("again"), rpId: "frafal.github.io", userVerification: "required"});
  assert.deepEqual([Buffer.from(r.challenge).toString(), r.allowCredentials], ["again", []]);
  // A credential from a phone without toJSON(): written by hand, the same fields.
  const buf = s => new TextEncoder().encode(s).buffer;
  const made = credentialJSON({id: "Y3JlZA", rawId: buf("cred"), type: "public-key", authenticatorAttachment: "platform", getClientExtensionResults: () => ({}),
    response: {clientDataJSON: buf("{}"), attestationObject: buf("att"), getAuthenticatorData: () => buf("ad"), getPublicKey: () => buf("pk"), getPublicKeyAlgorithm: () => -7, getTransports: () => ["internal"]}});
  assert.deepEqual(made, {id: "Y3JlZA", rawId: b64("cred"), type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
    response: {clientDataJSON: b64("{}"), attestationObject: b64("att"), authenticatorData: b64("ad"), publicKey: b64("pk"), publicKeyAlgorithm: -7, transports: ["internal"]}});
  const used = credentialJSON({id: "Y3JlZA", rawId: buf("cred"), type: "public-key", response: {clientDataJSON: buf("{}"), authenticatorData: buf("ad"), signature: buf("sig"), userHandle: buf("user-1")}});
  assert.deepEqual(used.response, {clientDataJSON: b64("{}"), authenticatorData: b64("ad"), signature: b64("sig"), userHandle: b64("user-1")});
  // The browser's own toJSON() wins when there is one.
  assert.deepEqual(credentialJSON({toJSON: () => ({id: "native"})}), {id: "native"});
});

test("without a service address, the account part is not there", () => {
  assert.equal(hasService(), false, "js/config.js is empty while developing");
});

test("a chat app's request: its id from the address, and only its own kinds of address back", () => {
  assert.equal(chatRequestId("#authorize=Abc_def-1234567890XYZ"), "Abc_def-1234567890XYZ");
  for(const h of ["", "#trips", "#authorize=", "#authorize=short", "#authorize=a b c d e f g h i j", "#authorize=<script>alert(1)</script>xxxxxx"]) assert.equal(chatRequestId(h), "", h);
  assert.equal(chatAddress("https://claude.ai/api/mcp/auth_callback?code=x&state=y"), "https://claude.ai/api/mcp/auth_callback?code=x&state=y");
  assert.equal(chatAddress("http://localhost:53122/callback?code=x"), "http://localhost:53122/callback?code=x");
  for(const bad of ["javascript:alert(1)", "http://evil.example/cb", "data:text/html,x", "nonsense"]) assert.equal(chatAddress(bad), "", bad);
  assert.deepEqual(["localhost", "127.0.0.1", "claude.ai"].map(onThisComputer), [true, true, false]);
});

test("a device in a few words, from what its browser says", async () => {
  const { deviceName } = await import("../js/account.js");
  const ua = {
    "iPhone · Safari": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "iPhone · Chrome": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
    "Android · Chrome": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Android · Samsung Internet": "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    "Mac · Safari": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Windows · Edge": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Linux · Firefox": "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    // Cut short by an older service (80 characters): the device still says what it is.
    "iPhone": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KH",
    "": ""
  };
  for(const [name, s] of Object.entries(ua)) assert.equal(deviceName(s), name);
});
