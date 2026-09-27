import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LocationPicker } from './LocationPicker';

describe('LocationPicker', () => {
  it('renders default labels', async () => {
    await render(
      <LocationPicker
        country={null}
        province={null}
        city={null}
        onCountryChange={() => {}}
        onProvinceChange={() => {}}
        onCityChange={() => {}}
      />,
    );
    expect(screen.getByText('Country')).toBeTruthy();
    expect(screen.getByText('Province')).toBeTruthy();
    expect(screen.getByText('City')).toBeTruthy();
  });

  it('renders custom labels when given', async () => {
    await render(
      <LocationPicker
        country={null}
        province={null}
        city={null}
        onCountryChange={() => {}}
        onProvinceChange={() => {}}
        onCityChange={() => {}}
        labels={{ country: 'Mulk', province: 'Suba', city: 'Shehar' }}
      />,
    );
    expect(screen.getByText('Mulk')).toBeTruthy();
    expect(screen.getByText('Suba')).toBeTruthy();
    expect(screen.getByText('Shehar')).toBeTruthy();
  });

  it('renders the current values', async () => {
    await render(
      <LocationPicker
        country="Pakistan"
        province="Punjab"
        city="Lahore"
        onCountryChange={() => {}}
        onProvinceChange={() => {}}
        onCityChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Pakistan')).toBeTruthy();
    expect(screen.getByDisplayValue('Punjab')).toBeTruthy();
    expect(screen.getByDisplayValue('Lahore')).toBeTruthy();
  });

  it('converts an emptied field to null rather than an empty string', async () => {
    const onCountryChange = jest.fn();
    await render(
      <LocationPicker
        country="Pakistan"
        province={null}
        city={null}
        onCountryChange={onCountryChange}
        onProvinceChange={() => {}}
        onCityChange={() => {}}
      />,
    );
    fireEvent.changeText(screen.getByDisplayValue('Pakistan'), '');
    expect(onCountryChange).toHaveBeenCalledWith(null);
  });

  it('passes through a non-empty edit as text', async () => {
    const onCityChange = jest.fn();
    await render(
      <LocationPicker
        country={null}
        province={null}
        city={null}
        onCountryChange={() => {}}
        onProvinceChange={() => {}}
        onCityChange={onCityChange}
      />,
    );
    // Country, province, city render in that fixed order — the third empty field is the city input.
    const fields = screen.getAllByDisplayValue('');
    const cityField = fields[2];
    if (!cityField) throw new Error('the city input was not rendered');
    fireEvent.changeText(cityField, 'Multan');
    expect(onCityChange).toHaveBeenCalledWith('Multan');
  });
});
