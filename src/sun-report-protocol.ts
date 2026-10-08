import type { DataBounds, DataCoverage } from './data-coverage';
import type { PlaceCoordinates } from './places';
import type { BuildingFeature, TreeFeature } from './types';
import type { OverpassFromWorker, OverpassToWorker } from './overpass-bridge';
import type { DatasetStamp } from './pilot-format';

export const SUN_REPORT_MODEL_VERSION = 'sun-report-1';
export const REPORT_RADIUS_METERS = 532; // 500m shadow horizon plus model crown envelope
export const REPORT_SAMPLE_MINUTES = 5;
export const REPORT_TRANSITION_SECONDS = 60;
export type ReportState = 'sun' | 'shade' | 'filtered' | 'night' | 'unknown';
export type ReportTarget = { id: string; coordinates: PlaceCoordinates };
export type ReportSettings = { includeTrees: boolean; timeZone: string };
export type ReportCoverage = {
  bounds: DataBounds;
  buildings: DataCoverage;
  trees: DataCoverage | 'disabled';
  treeSources: string[];
  estimatedHeights: number;
  buildingsLimited: boolean;
  treesLimited: boolean;
  loadedAt: number;
  expiresAt: number;
  datasets?: DatasetStamp[];
};
export type ReportObstacles = { revision: string; buildings: BuildingFeature[]; trees: TreeFeature[]; coverage: ReportCoverage };
export type ReportWindow = { from: number; to: number; state: ReportState };
export type ReportTotals = Record<ReportState, number>;
export type DaySunReport = {
  modelVersion: string;
  target: ReportTarget;
  date: string;
  settings: ReportSettings;
  revision: string;
  coverage: ReportCoverage;
  complete: boolean;
  warnings: string[];
  start: number;
  end: number;
  sunrise: number | null;
  sunset: number | null;
  windows: ReportWindow[];
  totals: ReportTotals;
  daylightMinutes: number;
  directShareOfDaylight: number | null;
  longestSun: ReportWindow | null;
  parts: { morning: ReportTotals; midday: ReportTotals; evening: ReportTotals };
  accuracy: { sampleMinutes: number; transitionSeconds: number; daylight: 'solar-center-above-horizon'; estimated: true };
};
export type YearSunReport = {
  modelVersion: string;
  target: ReportTarget;
  year: number;
  settings: ReportSettings;
  revision: string;
  method: 'representative-days-not-monthly-averages';
  months: DaySunReport[];
  seasons: { spring: DaySunReport; summer: DaySunReport; autumn: DaySunReport; winter: DaySunReport };
};
export type ReportProgress = { phase: 'obstacles' | 'day' | 'year'; completed: number; total: number };
export type SunReportRequest = OverpassToWorker
  | { type: 'day'; id: number; target: ReportTarget; date: string; settings: ReportSettings }
  | { type: 'year'; id: number; target: ReportTarget; year: number; settings: ReportSettings }
  | { type: 'cancel'; id: number }
  | { type: 'invalidate' };
export type SunReportResponse = OverpassFromWorker
  | { type: 'progress'; id: number; progress: ReportProgress }
  | { type: 'day'; id: number; report: DaySunReport }
  | { type: 'year'; id: number; report: YearSunReport }
  | { type: 'error'; id: number; name: string; message: string };
