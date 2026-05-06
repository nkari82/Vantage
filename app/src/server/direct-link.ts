import si from "systeminformation";
import { runCommand } from "./shell.js";
import type { AppConfig, DirectLinkStatusView } from "../shared/types.js";

const LINUX_IP_COMMAND = "/sbin/ip";

function normalizeInterfaceCandidate(value: string): string {
  return value.trim().toLowerCase();
}

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isValidInterfaceName(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:\-\s]{1,64}$/.test(trimmed);
}

function subnetMaskToCidr(subnetMask: string): number {
  const octets = subnetMask.split(".").map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error("Invalid subnet mask");
  }

  const bits = octets
    .map((value) => value.toString(2).padStart(8, "0"))
    .join("");

  if (!/^1*0*$/.test(bits)) {
    throw new Error("Invalid subnet mask");
  }

  return bits.split("").filter((bit) => bit === "1").length;
}

export async function resolveDirectLinkStatus(config: AppConfig, lastAppliedAt: number | null): Promise<DirectLinkStatusView> {
  const directLink = config.directLink;
  const interfaces = await si.networkInterfaces();
  const candidateInterfaces = interfaces
    .filter((entry) => !entry.internal && !entry.virtual)
    .map((entry) => entry.ifaceName || entry.iface)
    .filter((value, index, array) => value && array.indexOf(value) === index);

  const normalizedTarget = normalizeInterfaceCandidate(directLink.interfaceName);
  const matched = interfaces.find((entry) => {
    const iface = normalizeInterfaceCandidate(entry.iface);
    const ifaceName = normalizeInterfaceCandidate(entry.ifaceName);
    return Boolean(normalizedTarget) && (iface === normalizedTarget || ifaceName === normalizedTarget);
  }) ?? null;

  const linkState = matched?.operstate === "up"
    ? "up"
    : matched?.operstate === "down"
      ? "down"
      : "unknown";
  const localIp = matched?.ip4 || null;
  const actualInterfaceName = matched ? (matched.ifaceName || matched.iface) : null;
  const defaultRoute = matched?.default ?? null;
  const speedMbps = matched?.speed ?? null;
  const mtu = matched?.mtu ?? (Number.isFinite(directLink.mtu) ? directLink.mtu : null);
  const dhcp = typeof matched?.dhcp === "boolean" ? matched.dhcp : null;
  const configured = Boolean(directLink.interfaceName.trim());

  let note: string | undefined;
  if (!configured) {
    note = "NIC not selected";
  } else if (!matched) {
    note = "Configured NIC not found on this host";
  } else if (!localIp) {
    note = "NIC found but IPv4 is not assigned";
  }

  const needsAttention = !directLink.enabled
    ? false
    : !configured || !matched || linkState !== "up" || localIp !== directLink.localIp;

  return {
    configured,
    enabled: directLink.enabled,
    interfaceName: directLink.interfaceName,
    actualInterfaceName,
    localIp,
    peerIp: directLink.peerIp,
    subnetMask: directLink.subnetMask,
    mtu,
    linkState,
    speedMbps,
    dhcp,
    defaultRoute,
    candidateInterfaces,
    needsAttention,
    note,
    lastAppliedAt,
  };
}

export async function applyDirectLinkConfig(config: AppConfig): Promise<void> {
  const directLink = config.directLink;
  if (!directLink.enabled) {
    return;
  }

  const interfaceName = directLink.interfaceName.trim();
  if (!interfaceName) {
    throw new Error("Direct-link NIC is not configured");
  }
  if (!isValidInterfaceName(interfaceName)) {
    throw new Error("Direct-link NIC name contains unsupported characters");
  }
  if (!isValidIpv4(directLink.localIp)) {
    throw new Error("Direct-link local IPv4 is invalid");
  }
  if (!isValidIpv4(directLink.peerIp)) {
    throw new Error("Direct-link peer IPv4 is invalid");
  }
  if (!isValidIpv4(directLink.subnetMask)) {
    throw new Error("Direct-link subnet mask is invalid");
  }

  const mtu = Math.max(576, Math.min(9000, Math.round(directLink.mtu)));
  if (process.platform === "win32") {
    await runCommand("netsh", ["interface", "ip", "set", "address", `name=${interfaceName}`, "static", directLink.localIp, directLink.subnetMask]);
    await runCommand("netsh", ["interface", "ipv4", "set", "subinterface", interfaceName, `mtu=${mtu}`, "store=persistent"]);
    return;
  }

  if (process.platform === "linux") {
    const cidr = subnetMaskToCidr(directLink.subnetMask);
    await runCommand(LINUX_IP_COMMAND, ["link", "set", interfaceName, "up"]);
    await runCommand(LINUX_IP_COMMAND, ["addr", "replace", `${directLink.localIp}/${cidr}`, "dev", interfaceName]);
    await runCommand(LINUX_IP_COMMAND, ["link", "set", "dev", interfaceName, "mtu", String(mtu)]);
    return;
  }

  throw new Error(`Direct-link apply is not supported on ${process.platform}`);
}
