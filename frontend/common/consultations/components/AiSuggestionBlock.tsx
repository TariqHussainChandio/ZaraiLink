import React from 'react';
import { Banner } from '../../components';

export interface AiSuggestion {
  /** The disease the model matched, as the scan reported it. */
  label: string;
  /** 0 to 1; `null` when the scan did not report one. */
  confidence: number | null;
}

// Mirrors the scan's own threshold (frontend/ai LOW_CONFIDENCE_THRESHOLD, not exported through its index): below it the
// model was not sure, and the expert should read the photo, not the label.
const SURE_ENOUGH = 0.6;

/** What the plant scan suggested, on its own advisory block and never in anyone's words (BR-13): the farmer did not write
 * it and the expert did not assess it. The expert's assessment is a separate thing. */
export function AiSuggestionBlock({ suggestion }: { suggestion: AiSuggestion }) {
  const { label, confidence } = suggestion;
  const how =
    confidence === null
      ? ''
      : `, ${confidence >= SURE_ENOUGH ? 'likely' : 'not sure'} (${Math.round(confidence * 100)}%)`;
  return (
    <Banner tone="advisory" title="AI suggestion, not an expert's assessment">
      {`${label}${how}`}
    </Banner>
  );
}
