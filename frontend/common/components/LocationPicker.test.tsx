import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PROVINCES } from '../constants/locations';
import { LocationPicker } from './LocationPicker';

const noop = () => undefined;

describe('LocationPicker', () => {
  it('has a province and a city, and no country field, because the country is Pakistan', async () => {
    await render(<LocationPicker province={null} city={null} onProvinceChange={noop} onCityChange={noop} />);
    expect(screen.getByText('Province')).toBeTruthy();
    expect(screen.getByText('City')).toBeTruthy();
    expect(screen.queryByText('Country')).toBeNull();
  });

  it('renders custom labels when given', async () => {
    await render(<LocationPicker province={null} city={null} onProvinceChange={noop} onCityChange={noop} labels={{ province: 'Suba', city: 'Shehar' }} />);
    expect(screen.getByText('Suba')).toBeTruthy();
    expect(screen.getByText('Shehar')).toBeTruthy();
  });

  it('shows the current province and city', async () => {
    await render(<LocationPicker province="Punjab" city="Lahore" onProvinceChange={noop} onCityChange={noop} />);
    expect(screen.getByRole('button', { name: 'Province, Punjab' })).toBeTruthy();
    expect(screen.getByDisplayValue('Lahore')).toBeTruthy();
  });

  it('offers the seven provinces and territories from a list, never free text', async () => {
    await render(<LocationPicker province={null} city={null} onProvinceChange={noop} onCityChange={noop} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Province/ }));
    for (const name of PROVINCES) expect(await screen.findByText(name)).toBeTruthy();
    expect(PROVINCES).toHaveLength(7);
    expect(PROVINCES).toEqual(
      expect.arrayContaining(['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu and Kashmir']),
    );
  });

  it('reports the chosen province, and the country with it for a form that stores one', async () => {
    const onProvinceChange = jest.fn();
    const onCountryChange = jest.fn();
    await render(<LocationPicker province={null} city={null} onProvinceChange={onProvinceChange} onCityChange={noop} onCountryChange={onCountryChange} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Province/ }));
    await fireEvent.press(await screen.findByText('Sindh'));
    expect(onProvinceChange).toHaveBeenCalledWith('Sindh');
    expect(onCountryChange).toHaveBeenCalledWith('Pakistan');
  });

  it('converts an emptied city to null rather than an empty string', async () => {
    const onCityChange = jest.fn();
    await render(<LocationPicker province={null} city="Multan" onProvinceChange={noop} onCityChange={onCityChange} />);
    await fireEvent.changeText(screen.getByDisplayValue('Multan'), '');
    expect(onCityChange).toHaveBeenCalledWith(null);
  });

  it('passes through a non-empty city as text', async () => {
    const onCityChange = jest.fn();
    await render(<LocationPicker province={null} city={null} onProvinceChange={noop} onCityChange={onCityChange} />);
    await fireEvent.changeText(screen.getByLabelText('City'), 'Multan');
    expect(onCityChange).toHaveBeenCalledWith('Multan');
  });

  it('shows an error under each field', async () => {
    await render(
      <LocationPicker province={null} city={null} onProvinceChange={noop} onCityChange={noop} errors={{ province: 'Province is required', city: 'Enter the city' }} />,
    );
    expect(screen.getByText('Province is required')).toBeTruthy();
    expect(screen.getByText('Enter the city')).toBeTruthy();
  });

  it('still shows a province saved before the list existed, instead of reading as nothing chosen', async () => {
    await render(<LocationPicker province="Sind" city={null} onProvinceChange={noop} onCityChange={noop} />);
    expect(screen.getByRole('button', { name: 'Province, Sind' })).toBeTruthy();
  });
});
