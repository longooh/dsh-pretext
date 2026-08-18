/**
 * dsh-pretext — host half.
 *
 * Intentionally a no-op loader entry: the whole value lives in the browser
 * half (`./client`), picked up by dsh-client-modules through the package's
 * `dsh.client` declaration — the same shape as dsh-font / ui-* packages.
 * The browser half exposes @chenglou/pretext (canvas-based text measurement
 * & layout) as an async client module.
 */
export function apply() {}
