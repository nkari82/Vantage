import fs from 'fs';
import path from 'path';

interface PowerStatsLocal {
  month: number;
  year: number;
  totalKwh: number;
}

export class PowerTracker {
  private statsFilePath: string;
  private stats: PowerStatsLocal;

  constructor(statsDir: string) {
    this.statsFilePath = path.join(statsDir, 'power-stats.json');
    this.stats = this.loadStats();
  }

  private loadStats(): PowerStatsLocal {
    if (fs.existsSync(this.statsFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.statsFilePath, 'utf8'));
        const now = new Date();
        if (data.month === now.getMonth() && data.year === now.getFullYear()) {
          return data;
        }
      } catch (e) {
        console.error("Failed to load power stats, resetting:", e);
      }
    }
    return { month: new Date().getMonth(), year: new Date().getFullYear(), totalKwh: 0 };
  }

  private saveStats() {
    fs.writeFileSync(this.statsFilePath, JSON.stringify(this.stats, null, 2));
  }

  public addEnergy(watts: number, durationMs: number) {
    const kwh = (watts * (durationMs / 1000) / 3600) / 1000;
    
    const now = new Date();
    if (this.stats.month !== now.getMonth() || this.stats.year !== now.getFullYear()) {
      this.stats = { month: now.getMonth(), year: now.getFullYear(), totalKwh: 0 };
    }
    
    this.stats.totalKwh += kwh;
    this.saveStats();
  }

  public getStats() {
    return this.stats;
  }
}
