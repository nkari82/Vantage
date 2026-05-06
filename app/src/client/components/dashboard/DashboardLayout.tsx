import { AlertRail } from "./AlertRail";
import { CommandRail } from "./CommandRail";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
import { steamHealthLabel } from "./constants";
import type { DashboardActions, DashboardViewModel } from "./types";
import { AnalyticsSection } from "./sections/AnalyticsSection";
import { FocusSection } from "./sections/FocusSection";
import { LogsSection } from "./sections/LogsSection";
import { MetricsStrip } from "./sections/MetricsStrip";
import { OperationsSection } from "./sections/OperationsSection";
import { SettingsSection } from "./sections/SettingsSection";
import { SystemsSection } from "./sections/SystemsSection";
import { UtilitySection } from "./sections/UtilitySection";
import { CostSummaryCard } from "./sections/CostSummaryCard";
import { PowerTimelineCard } from "./sections/PowerTimelineCard";

interface DashboardLayoutProps {
  viewModel: DashboardViewModel;
  actions: DashboardActions;
  formatTimestamp: (value: number | null | undefined) => string;
  formatNumber: (value: number, digits?: number) => string;
}

export function DashboardLayout({ viewModel, actions, formatTimestamp, formatNumber }: DashboardLayoutProps) {
  const {
    activeRail,
    status,
    steamStatus,
    steamReplay,
    powerHistory,
    powerStats,
    logEntries,
    logService,
    logLines,
    logQuery,
    logLevel,
    logSource,
    logTotal,
    logsUnavailable,
    config,
    isSavingConfig,
    gatewayToken,
    notice,
    error,
    stressStatus,
    currentPageCopy,
    health,
    isWindows,
    estimatedSystemPower,
    totalGpuPower,
    cpuPowerLabel,
    queueLoad,
    memoryPercent,
    signalLabels,
    modePolyline,
    cpuPolyline,
    thermalPolyline,
    thermalSignal,
    gpuUtilizationValues,
    vramPressureValues,
    stageMetrics,
    assistantInsights,
    overviewStats,
    serviceEntries,
    activeServiceCount,
    maxStorageUse,
    networkLoad,
    gpuMemoryPressure,
    coreBars,
    focusGridClassName,
    systemsGridClassName,
    utilityGridClassName,
    visibility,
  } = viewModel;

  const system = status?.system;
  const gateway = status?.gateway;

  return (
    <main className="dashboard-shell dashboard-shell--reference">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />

      <CommandRail activeRail={activeRail} onNavigate={actions.navigateToPage} onLogout={actions.handleLogout} />

      <section className="workspace">
        <WorkspaceTopbar
          page={activeRail}
          title={currentPageCopy.title}
          description={currentPageCopy.description}
          health={health}
          modeLabel={status?.mode ?? "SYNCING"}
        />

        <AlertRail error={error} notice={notice} alerts={status?.alerts ?? []} isWindows={isWindows} />

        {visibility.showHeroMetrics && <MetricsStrip stats={overviewStats} />}

        {visibility.showSignalsCompactFlow ? (
          <>
            <AnalyticsSection
              signalLabels={signalLabels}
              modePolyline={modePolyline}
              cpuPolyline={cpuPolyline}
              thermalPolyline={thermalPolyline}
              stageMetrics={stageMetrics}
              cpuUsagePercent={system?.cpuUsagePercent ?? 0}
              memoryPercent={memoryPercent}
              gpuMemoryPressure={gpuMemoryPressure}
              queueLoad={queueLoad}
              lastUsedAt={status?.lastUsedAt ?? null}
              idleRemainingSeconds={gateway?.idleRemainingSeconds ?? 0}
              networkLoad={networkLoad}
              maxStorageUse={maxStorageUse}
              totalGpuPower={totalGpuPower}
              cpuPowerW={system?.cpuPowerW ?? 0}
              steamHealthLabel={steamHealthLabel(steamStatus)}
              gatewayEnabled={status?.llmGatewayEnabled ?? false}
              activeServiceCount={activeServiceCount}
              serviceCount={serviceEntries.length}
              assistantInsights={assistantInsights}
              gpuUtilizationValues={gpuUtilizationValues}
              thermalSignal={thermalSignal}
              vramPressureValues={vramPressureValues}
              gpuMemoryPressureFallback={gpuMemoryPressure}
              formatTimestamp={formatTimestamp}
              formatNumber={formatNumber}
            />
            <section className="signal-summary-grid operations-grid operations-grid--dual">
              {visibility.showCostPanel && (
                <CostSummaryCard
                  powerStats={powerStats}
                  estimatedSystemPower={estimatedSystemPower}
                  totalGpuPower={totalGpuPower}
                  cpuPowerLabel={cpuPowerLabel}
                  status={status}
                  formatNumber={formatNumber}
                />
              )}
              {visibility.showPowerTimelineSection && (
                <PowerTimelineCard powerHistory={powerHistory} formatTimestamp={formatTimestamp} />
              )}
            </section>
          </>
        ) : (
          <>
            {visibility.showAnalyticsPage && (
              <AnalyticsSection
                signalLabels={signalLabels}
                modePolyline={modePolyline}
                cpuPolyline={cpuPolyline}
                thermalPolyline={thermalPolyline}
                stageMetrics={stageMetrics}
                cpuUsagePercent={system?.cpuUsagePercent ?? 0}
                memoryPercent={memoryPercent}
                gpuMemoryPressure={gpuMemoryPressure}
                queueLoad={queueLoad}
                lastUsedAt={status?.lastUsedAt ?? null}
                idleRemainingSeconds={gateway?.idleRemainingSeconds ?? 0}
                networkLoad={networkLoad}
                maxStorageUse={maxStorageUse}
                totalGpuPower={totalGpuPower}
                cpuPowerW={system?.cpuPowerW ?? 0}
                steamHealthLabel={steamHealthLabel(steamStatus)}
                gatewayEnabled={status?.llmGatewayEnabled ?? false}
                activeServiceCount={activeServiceCount}
                serviceCount={serviceEntries.length}
                assistantInsights={assistantInsights}
                gpuUtilizationValues={gpuUtilizationValues}
                thermalSignal={thermalSignal}
                vramPressureValues={vramPressureValues}
                gpuMemoryPressureFallback={gpuMemoryPressure}
                formatTimestamp={formatTimestamp}
                formatNumber={formatNumber}
              />
            )}

            {(visibility.showSteamPanel || visibility.showGatewayPanel || visibility.showCostPanel) && (
              <FocusSection
                className={focusGridClassName}
                showSteamPanel={visibility.showSteamPanel}
                showGatewayPanel={visibility.showGatewayPanel}
                showCostPanel={visibility.showCostPanel}
                steamStatus={steamStatus}
                steamReplay={steamReplay}
                status={status}
                powerStats={powerStats}
                queueLoad={queueLoad}
                steamCounts={steamStatus?.queueSummary ?? status?.queueSummary ?? { queued: 0, processing: 0, completed: 0, failed: 0 }}
                gatewayToken={gatewayToken}
                estimatedSystemPower={estimatedSystemPower}
                totalGpuPower={totalGpuPower}
                cpuPowerLabel={cpuPowerLabel}
                formatTimestamp={formatTimestamp}
                formatNumber={formatNumber}
                actions={actions}
              />
            )}
          </>
        )}

        {visibility.isSettingsPage && (
          <SettingsSection
            config={config}
            directLinkStatus={status?.directLink ?? null}
            isSaving={isSavingConfig}
            onConfigChange={actions.setConfig}
            onSave={() => {
              void actions.saveConfig();
            }}
            onApplyDirectLink={() => {
              void actions.applyDirectLink();
            }}
          />
        )}

        {visibility.showSettingsPageContent && (
          <OperationsSection currentMode={status?.mode} stressStatus={stressStatus} actions={actions} />
        )}

        {visibility.showSystemsPageContent && (
          <SystemsSection
            className={systemsGridClassName}
            status={status}
            coreBars={coreBars}
            memoryPercent={memoryPercent}
            formatNumber={formatNumber}
          />
        )}

        {!visibility.showSignalsCompactFlow && (visibility.showServiceHealthSection || visibility.showPowerTimelineSection) && (
          <UtilitySection
            className={utilityGridClassName}
            showServiceHealthSection={visibility.showServiceHealthSection}
            showPowerTimelineSection={visibility.showPowerTimelineSection}
            serviceEntries={serviceEntries}
            powerHistory={powerHistory}
            formatTimestamp={formatTimestamp}
          />
        )}

        {visibility.showLogsPanel && (
          <LogsSection
            logService={logService}
            logLines={logLines}
            logQuery={logQuery}
            logLevel={logLevel}
            logEntries={logEntries}
            logSource={logSource}
            logTotal={logTotal}
            logsUnavailable={logsUnavailable}
            onLogServiceChange={actions.setLogService}
            onLogLinesChange={actions.setLogLines}
            onLogQueryChange={actions.setLogQuery}
            onLogLevelChange={actions.setLogLevel}
            onRefresh={actions.refreshLogs}
            formatTimestamp={formatTimestamp}
          />
        )}
      </section>
    </main>
  );
}
