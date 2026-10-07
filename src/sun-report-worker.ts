import { createWorkerOverpassGate } from './overpass-bridge';
import { setOverpassGate } from './overpass';
import { createSunReportService } from './sun-report-service';
import type { SunReportRequest, SunReportResponse } from './sun-report-protocol';

const send = (message: SunReportResponse) => postMessage(message);
const gate = createWorkerOverpassGate(send);
setOverpassGate(gate);
const service = createSunReportService(send);
self.onmessage = (event: MessageEvent<SunReportRequest>) => {
  if (event.data.type === 'overpass-grant' || event.data.type === 'overpass-denied') gate.handle(event.data);
  else service.handle(event.data);
};
