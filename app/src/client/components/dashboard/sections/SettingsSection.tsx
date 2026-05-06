import type { AppConfig, DirectLinkStatusView, PowerMode } from "../../../../shared/types";

const runtimeModes: Array<Exclude<PowerMode, "ADAPTIVE">> = ["DEFAULT", "LOW_POWER", "STANDARD_250", "STANDARD_280"];
const governorOptions = ["powersave", "ondemand", "performance"] as const;

interface SettingsSectionProps {
  config: AppConfig | null;
  directLinkStatus: DirectLinkStatusView | null;
  isSaving: boolean;
  onConfigChange: (next: AppConfig) => void;
  onSave: () => void;
  onApplyDirectLink: () => void;
}

const fallbackConfig: AppConfig = {
  ak620: {
    refreshIntervalSeconds: 4,
    minRefreshInterval: 1,
    maxRefreshInterval: 60,
  },
  directLink: {
    enabled: false,
    interfaceName: "",
    localIp: "10.77.0.1",
    peerIp: "10.77.0.2",
    subnetMask: "255.255.255.0",
    mtu: 9000,
    autoApply: false,
    lastAppliedAt: null,
  },
  lowPowerMode: {
    gpuPowerLimitW: 60,
    cpuGovernor: "powersave",
    stopServices: [],
    nvmePowerSave: true,
    fanMinRpm: true,
  },
  llmGateway: {
    enabled: true,
    upstreamUrl: "http://127.0.0.1:8000",
    listenPort: 8080,
    idleTimeoutMinutes: 30,
    autoStartVllm: true,
    autoStopVllm: false,
    activePowerMode: "STANDARD_280",
    idlePowerMode: "LOW_POWER",
  },
  powerModes: {
    DEFAULT: {
      gpuPowerLimitW: 150,
      cpuGovernor: "ondemand",
      description: "균형 잡힌 기본 모드",
    },
    LOW_POWER: {
      gpuPowerLimitW: 60,
      cpuGovernor: "powersave",
      description: "GPU 최소 전력, 시스템 최소 대기전력",
    },
    STANDARD_250: {
      gpuPowerLimitW: 250,
      cpuGovernor: "ondemand",
      description: "조용한 LLM 운용",
    },
    STANDARD_280: {
      gpuPowerLimitW: 280,
      cpuGovernor: "performance",
      description: "권장 LLM 운용",
    },
  },
  alerts: {
    gpuTempThresholdC: 85,
    memoryUsageThresholdPercent: 90,
  },
  powerTracking: {
    basePowerEstimateW: 60,
    powerCostPerKwh: 200,
  },
};

function normalizeConfig(config: AppConfig): AppConfig {
  return {
    ak620: {
      ...fallbackConfig.ak620,
      ...(config.ak620 ?? {}),
    },
    directLink: {
      ...fallbackConfig.directLink,
      ...(config.directLink ?? {}),
    },
    lowPowerMode: {
      ...fallbackConfig.lowPowerMode,
      ...(config.lowPowerMode ?? {}),
      stopServices: Array.isArray(config.lowPowerMode?.stopServices)
        ? config.lowPowerMode.stopServices.filter((value): value is string => typeof value === "string")
        : fallbackConfig.lowPowerMode.stopServices,
    },
    llmGateway: {
      ...fallbackConfig.llmGateway,
      ...(config.llmGateway ?? {}),
    },
    powerModes: {
      DEFAULT: {
        ...fallbackConfig.powerModes.DEFAULT,
        ...(config.powerModes?.DEFAULT ?? {}),
      },
      LOW_POWER: {
        ...fallbackConfig.powerModes.LOW_POWER,
        ...(config.powerModes?.LOW_POWER ?? {}),
      },
      STANDARD_250: {
        ...fallbackConfig.powerModes.STANDARD_250,
        ...(config.powerModes?.STANDARD_250 ?? {}),
      },
      STANDARD_280: {
        ...fallbackConfig.powerModes.STANDARD_280,
        ...(config.powerModes?.STANDARD_280 ?? {}),
      },
    },
    alerts: {
      ...fallbackConfig.alerts,
      ...(config.alerts ?? {}),
    },
    powerTracking: {
      ...fallbackConfig.powerTracking,
      ...(config.powerTracking ?? {}),
    },
  };
}

export function SettingsSection({ config, directLinkStatus, isSaving, onConfigChange, onSave, onApplyDirectLink }: SettingsSectionProps) {
  if (!config) {
    return (
      <section className="glass-card panel panel--section settings-empty">
        <div className="panel__head">
          <div>
            <p className="eyebrow">Runtime Settings</p>
            <h2>Configuration</h2>
          </div>
        </div>
        <p className="muted-copy">설정 정보를 불러오는 중입니다.</p>
      </section>
    );
  }

  const safeConfig = normalizeConfig(config);

  const updateGateway = <K extends keyof AppConfig["llmGateway"]>(key: K, value: AppConfig["llmGateway"][K]) => {
    onConfigChange({
      ...safeConfig,
      llmGateway: {
        ...safeConfig.llmGateway,
        [key]: value,
      },
    });
  };

  const updateAk620 = <K extends keyof AppConfig["ak620"]>(key: K, value: AppConfig["ak620"][K]) => {
    onConfigChange({
      ...safeConfig,
      ak620: {
        ...safeConfig.ak620,
        [key]: value,
      },
    });
  };

  const updateDirectLink = <K extends keyof AppConfig["directLink"]>(key: K, value: AppConfig["directLink"][K]) => {
    onConfigChange({
      ...safeConfig,
      directLink: {
        ...safeConfig.directLink,
        [key]: value,
      },
    });
  };

  const updateAlerts = <K extends keyof AppConfig["alerts"]>(key: K, value: AppConfig["alerts"][K]) => {
    onConfigChange({
      ...safeConfig,
      alerts: {
        ...safeConfig.alerts,
        [key]: value,
      },
    });
  };

  const updatePowerTracking = <K extends keyof AppConfig["powerTracking"]>(key: K, value: AppConfig["powerTracking"][K]) => {
    onConfigChange({
      ...safeConfig,
      powerTracking: {
        ...safeConfig.powerTracking,
        [key]: value,
      },
    });
  };

  const updateLowPower = <K extends keyof AppConfig["lowPowerMode"]>(key: K, value: AppConfig["lowPowerMode"][K]) => {
    onConfigChange({
      ...safeConfig,
      lowPowerMode: {
        ...safeConfig.lowPowerMode,
        [key]: value,
      },
    });
  };

  const updatePowerMode = <K extends keyof AppConfig["powerModes"][Exclude<PowerMode, "ADAPTIVE">]>(
    mode: Exclude<PowerMode, "ADAPTIVE">,
    key: K,
    value: AppConfig["powerModes"][Exclude<PowerMode, "ADAPTIVE">][K],
  ) => {
    onConfigChange({
      ...safeConfig,
      powerModes: {
        ...safeConfig.powerModes,
        [mode]: {
          ...safeConfig.powerModes[mode],
          [key]: value,
        },
      },
    });
  };

  return (
    <section className="settings-section">
      <div className="panel__head settings-toolbar">
        <div>
          <p className="eyebrow">Runtime Settings</p>
          <h2>Configuration</h2>
          <p className="muted-copy">config.json에 저장되는 운영 값을 이 화면에서 바로 조정할 수 있습니다.</p>
        </div>
        <button onClick={onSave} disabled={isSaving}>{isSaving ? "Saving..." : "Save Settings"}</button>
      </div>

      <section className="settings-grid operations-grid operations-grid--dual">
        <article className="glass-card panel panel--section settings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Gateway Runtime</p>
              <h2>Gateway & vLLM</h2>
            </div>
            <span className={`pill ${safeConfig.llmGateway.enabled ? "pill--green" : "pill--red"}`}>{safeConfig.llmGateway.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="settings-grid-fields">
            <div className="form-group">
              <label htmlFor="gateway-upstream">Upstream URL</label>
              <input id="gateway-upstream" type="text" value={safeConfig.llmGateway.upstreamUrl} onChange={(event) => updateGateway("upstreamUrl", event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="gateway-listen-port">Listen Port</label>
              <input id="gateway-listen-port" type="number" value={safeConfig.llmGateway.listenPort} onChange={(event) => updateGateway("listenPort", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="gateway-idle-timeout">Idle Timeout (min)</label>
              <input id="gateway-idle-timeout" type="number" value={safeConfig.llmGateway.idleTimeoutMinutes} onChange={(event) => updateGateway("idleTimeoutMinutes", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="gateway-enabled">Gateway Enabled</label>
              <select id="gateway-enabled" value={String(safeConfig.llmGateway.enabled)} onChange={(event) => updateGateway("enabled", event.target.value === "true")}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="gateway-active-mode">Active Power Mode</label>
              <select id="gateway-active-mode" value={safeConfig.llmGateway.activePowerMode} onChange={(event) => updateGateway("activePowerMode", event.target.value as AppConfig["llmGateway"]["activePowerMode"])}>
                {runtimeModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="gateway-idle-mode">Idle Power Mode</label>
              <select id="gateway-idle-mode" value={safeConfig.llmGateway.idlePowerMode} onChange={(event) => updateGateway("idlePowerMode", event.target.value as AppConfig["llmGateway"]["idlePowerMode"])}>
                {runtimeModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </div>
          </div>
          <div className="settings-toggle-grid">
            <label className="checkbox-group">
              <input type="checkbox" checked={safeConfig.llmGateway.autoStartVllm} onChange={(event) => updateGateway("autoStartVllm", event.target.checked)} />
              <span>Auto start vLLM</span>
            </label>
            <label className="checkbox-group">
              <input type="checkbox" checked={safeConfig.llmGateway.autoStopVllm} onChange={(event) => updateGateway("autoStopVllm", event.target.checked)} />
              <span>Auto stop vLLM</span>
            </label>
          </div>
        </article>

        <article className="glass-card panel panel--section settings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Dedicated NIC</p>
              <h2>Direct Link</h2>
            </div>
            <span className={`pill ${safeConfig.directLink.enabled ? (directLinkStatus?.needsAttention ? "pill--amber" : "pill--green") : "pill--red"}`}>
              {!safeConfig.directLink.enabled ? "Disabled" : directLinkStatus?.linkState === "up" ? "Link Up" : "Needs Check"}
            </span>
          </div>
          <div className="settings-grid-fields">
            <div className="form-group">
              <label htmlFor="direct-link-interface">NIC Name</label>
              <input id="direct-link-interface" type="text" value={safeConfig.directLink.interfaceName} onChange={(event) => updateDirectLink("interfaceName", event.target.value)} placeholder="Ethernet 2 / enp6s0" />
            </div>
            <div className="form-group">
              <label htmlFor="direct-link-local-ip">Host Local IP</label>
              <input id="direct-link-local-ip" type="text" value={safeConfig.directLink.localIp} onChange={(event) => updateDirectLink("localIp", event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="direct-link-peer-ip">Peer PC IP</label>
              <input id="direct-link-peer-ip" type="text" value={safeConfig.directLink.peerIp} onChange={(event) => updateDirectLink("peerIp", event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="direct-link-subnet">Subnet Mask</label>
              <input id="direct-link-subnet" type="text" value={safeConfig.directLink.subnetMask} onChange={(event) => updateDirectLink("subnetMask", event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="direct-link-mtu">MTU</label>
              <input id="direct-link-mtu" type="number" value={safeConfig.directLink.mtu} onChange={(event) => updateDirectLink("mtu", Number(event.target.value))} min={576} />
            </div>
            <div className="form-group settings-panel--full">
              <label>Detected Candidate NICs</label>
              <div className="settings-candidate-list">
                {directLinkStatus?.candidateInterfaces?.length
                  ? directLinkStatus.candidateInterfaces.map((candidate) => (
                    <button key={candidate} type="button" className={`settings-candidate-chip ${safeConfig.directLink.interfaceName.trim().toLowerCase() === candidate.trim().toLowerCase() ? "settings-candidate-chip--active" : ""}`} onClick={() => updateDirectLink("interfaceName", candidate)}>
                      {candidate}
                    </button>
                  ))
                  : <span className="empty">후보 NIC를 아직 찾지 못했습니다.</span>}
              </div>
            </div>
          </div>
          <div className="settings-toggle-grid">
            <label className="checkbox-group">
              <input type="checkbox" checked={safeConfig.directLink.enabled} onChange={(event) => updateDirectLink("enabled", event.target.checked)} />
              <span>Enable direct PC link</span>
            </label>
            <label className="checkbox-group">
              <input type="checkbox" checked={safeConfig.directLink.autoApply} onChange={(event) => updateDirectLink("autoApply", event.target.checked)} />
              <span>Auto apply on save</span>
            </label>
          </div>
          <div className="kv-list kv-list--compact">
            <span>Current Interface</span><strong>{directLinkStatus?.actualInterfaceName ?? "not matched"}</strong>
            <span>Current IPv4</span><strong>{directLinkStatus?.localIp ?? "unassigned"}</strong>
            <span>Link State</span><strong>{directLinkStatus?.linkState ?? "unknown"}</strong>
            <span>Speed</span><strong>{directLinkStatus?.speedMbps ? `${directLinkStatus.speedMbps} Mbps` : "unknown"}</strong>
            <span>Last Applied</span><strong>{directLinkStatus?.lastAppliedAt ? new Date(directLinkStatus.lastAppliedAt).toLocaleString() : "not yet"}</strong>
          </div>
          {directLinkStatus?.note && <p className="muted-copy settings-note">{directLinkStatus.note}</p>}
          <div className="button-row">
            <button type="button" onClick={onApplyDirectLink} disabled={isSaving || !safeConfig.directLink.enabled}>Apply Direct Link Now</button>
          </div>
        </article>

        <article className="glass-card panel panel--section settings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Display Agent</p>
              <h2>AK620</h2>
            </div>
            <span className="pill pill--cyan">{safeConfig.ak620.refreshIntervalSeconds}s</span>
          </div>
          <div className="settings-grid-fields">
            <div className="form-group">
              <label htmlFor="ak620-refresh">Refresh Interval (sec)</label>
              <input id="ak620-refresh" type="number" value={safeConfig.ak620.refreshIntervalSeconds} onChange={(event) => updateAk620("refreshIntervalSeconds", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="ak620-min">Min Interval</label>
              <input id="ak620-min" type="number" value={safeConfig.ak620.minRefreshInterval} onChange={(event) => updateAk620("minRefreshInterval", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="ak620-max">Max Interval</label>
              <input id="ak620-max" type="number" value={safeConfig.ak620.maxRefreshInterval} onChange={(event) => updateAk620("maxRefreshInterval", Number(event.target.value))} />
            </div>
          </div>
          <p className="muted-copy settings-note">새 간격을 적용한 뒤에는 AK620 Agent를 재시작하면 바로 반영됩니다.</p>
        </article>

        <article className="glass-card panel panel--section settings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Safety Thresholds</p>
              <h2>Alerts</h2>
            </div>
          </div>
          <div className="settings-grid-fields">
            <div className="form-group">
              <label htmlFor="alert-gpu-temp">GPU Temp Threshold (°C)</label>
              <input id="alert-gpu-temp" type="number" value={safeConfig.alerts.gpuTempThresholdC} onChange={(event) => updateAlerts("gpuTempThresholdC", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="alert-memory">Memory Threshold (%)</label>
              <input id="alert-memory" type="number" value={safeConfig.alerts.memoryUsageThresholdPercent} onChange={(event) => updateAlerts("memoryUsageThresholdPercent", Number(event.target.value))} />
            </div>
          </div>
        </article>

        <article className="glass-card panel panel--section settings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Electricity Model</p>
              <h2>Power Tracking</h2>
            </div>
          </div>
          <div className="settings-grid-fields">
            <div className="form-group">
              <label htmlFor="power-base">Base System Power (W)</label>
              <input id="power-base" type="number" value={safeConfig.powerTracking.basePowerEstimateW} onChange={(event) => updatePowerTracking("basePowerEstimateW", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="power-cost">Power Cost / kWh</label>
              <input id="power-cost" type="number" value={safeConfig.powerTracking.powerCostPerKwh} onChange={(event) => updatePowerTracking("powerCostPerKwh", Number(event.target.value))} />
            </div>
          </div>
        </article>

        <article className="glass-card panel panel--section settings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Idle Policy</p>
              <h2>Low Power Mode</h2>
            </div>
          </div>
          <div className="settings-grid-fields">
            <div className="form-group">
              <label htmlFor="low-power-limit">GPU Power Limit (W)</label>
              <input id="low-power-limit" type="number" value={safeConfig.lowPowerMode.gpuPowerLimitW} onChange={(event) => updateLowPower("gpuPowerLimitW", Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="low-power-governor">CPU Governor</label>
              <select id="low-power-governor" value={safeConfig.lowPowerMode.cpuGovernor} onChange={(event) => updateLowPower("cpuGovernor", event.target.value as AppConfig["lowPowerMode"]["cpuGovernor"])}>
                {governorOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="form-group settings-panel--full">
              <label htmlFor="low-power-services">Stopped Services (comma separated)</label>
              <input id="low-power-services" type="text" value={safeConfig.lowPowerMode.stopServices.join(", ")} onChange={(event) => updateLowPower("stopServices", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
            </div>
          </div>
          <div className="settings-toggle-grid">
            <label className="checkbox-group">
              <input type="checkbox" checked={safeConfig.lowPowerMode.nvmePowerSave} onChange={(event) => updateLowPower("nvmePowerSave", event.target.checked)} />
              <span>Enable NVMe power save</span>
            </label>
            <label className="checkbox-group">
              <input type="checkbox" checked={safeConfig.lowPowerMode.fanMinRpm} onChange={(event) => updateLowPower("fanMinRpm", event.target.checked)} />
              <span>Min fan RPM policy</span>
            </label>
          </div>
        </article>

        <article className="glass-card panel panel--section settings-panel settings-panel--wide">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Power Profiles</p>
              <h2>Mode Presets</h2>
            </div>
          </div>
          <div className="settings-mode-grid">
            {runtimeModes.map((mode) => (
              <div className="settings-mode-card" key={mode}>
                <div className="panel__head">
                  <div>
                    <p className="eyebrow">{mode}</p>
                    <h3>{mode.replace("STANDARD_", "STD ")}</h3>
                  </div>
                </div>
                <div className="settings-grid-fields">
                  <div className="form-group">
                    <label htmlFor={`${mode}-gpu-limit`}>GPU Limit (W)</label>
                    <input id={`${mode}-gpu-limit`} type="number" value={safeConfig.powerModes[mode].gpuPowerLimitW} onChange={(event) => updatePowerMode(mode, "gpuPowerLimitW", Number(event.target.value))} />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${mode}-governor`}>CPU Governor</label>
                    <select id={`${mode}-governor`} value={safeConfig.powerModes[mode].cpuGovernor} onChange={(event) => updatePowerMode(mode, "cpuGovernor", event.target.value as AppConfig["powerModes"][Exclude<PowerMode, "ADAPTIVE">]["cpuGovernor"])}>
                      {governorOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div className="form-group settings-panel--full">
                    <label htmlFor={`${mode}-description`}>Description</label>
                    <input id={`${mode}-description`} type="text" value={safeConfig.powerModes[mode].description} onChange={(event) => updatePowerMode(mode, "description", event.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}
