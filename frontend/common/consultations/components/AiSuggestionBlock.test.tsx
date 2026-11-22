import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AiSuggestionBlock } from './AiSuggestionBlock';

describe('AiSuggestionBlock', () => {
  it("labels the suggestion as the AI's, with the match in words and a percentage", async () => {
    await render(<AiSuggestionBlock suggestion={{ label: 'Leaf rust', confidence: 0.73 }} />);
    expect(screen.getByText("AI suggestion, not an expert's assessment")).toBeTruthy();
    expect(screen.getByText('Leaf rust, likely (73%)')).toBeTruthy();
  });

  it('says "not sure" below the threshold', async () => {
    await render(<AiSuggestionBlock suggestion={{ label: 'Leaf rust', confidence: 0.41 }} />);
    expect(screen.getByText('Leaf rust, not sure (41%)')).toBeTruthy();
  });

  it('shows just the label when the scan gave no confidence', async () => {
    await render(<AiSuggestionBlock suggestion={{ label: 'Leaf rust', confidence: null }} />);
    expect(screen.getByText('Leaf rust')).toBeTruthy();
  });
});
