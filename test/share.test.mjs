import { test } from "node:test";
import assert from "node:assert/strict";
import { creationOptions, requestOptions, credentialJSON, hasService } from "../js/share.js";

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
