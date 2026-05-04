export interface ISystemController {
  restartSystem(): Promise<void>;
  shutdownSystem(): Promise<void>;
  applyPowerMode(mode: string): Promise<void>;
  startService(serviceName: string): Promise<void>;
  stopService(serviceName: string): Promise<void>;
  isServiceActive(serviceName: string): Promise<boolean>;
  runCpuStressTest(durationSeconds: number): Promise<void>;
  runMemoryStressTest(durationSeconds: number): Promise<void>;
  rebootToMemtest(): Promise<void>;
}
