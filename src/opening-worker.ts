import { evaluateHours } from './opening-engine';
import type { HoursRequest, HoursResponse } from './opening-protocol';

const scope = self as unknown as { onmessage: (event: MessageEvent<HoursRequest>) => void; postMessage: (message: HoursResponse) => void };
scope.onmessage = event => {
  const request = event.data;
  scope.postMessage({ type: 'hours', id: request.id, result: {
    business: evaluateHours(request.business, request.context), kitchen: evaluateHours(request.kitchen, request.context),
    terrace: evaluateHours(request.terrace, request.context),
  } });
};
