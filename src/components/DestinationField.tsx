import React, { useImperativeHandle, useRef } from 'react';
import { COUNTRIES } from '../data/countries';

// The destination country-select + city-input pair, extracted from what
// was previously near-identical inline JSX duplicated in DashboardHome.tsx
// ("Your Move") and App.tsx's Relocation tab ("Your Relocation") — now the
// one real, reusable "destination dropdown component" for both of those,
// the inline destination prompt in JobMatcherTab.tsx, and (fix-chat-
// background-question-freelance) the chat's own "open-destination-field"
// action, which focuses the Relocation tab's instance of this component —
// see App.tsx's openDestinationField(). Behavior-preserving for the
// existing usages: same COUNTRIES list, same "Select a country…"
// placeholder, same onChange shape (country change reports both code and
// resolved name in one call, matching what locationService.ts's
// resolveDestinationFromParts needs).

export interface DestinationFieldHandle {
  // Scrolls to and focuses the country <select> — same
  // scrollIntoView+focus shape as ResumeUploaderHandle.focus(), for the
  // same reason: a chat-attached action button needs to land the user
  // exactly on the control to fill in, not just the general area.
  focus: () => void;
}

export interface DestinationFieldProps {
  countryCode: string;
  city: string;
  onCountryChange: (code: string, name: string) => void;
  onCityChange: (city: string) => void;
  // Distinct DOM ids per usage (this can render more than once on the same
  // page — e.g. the Relocation tab's form and this fix's new inline prompt
  // could both exist at once) so <label htmlFor> never collides.
  idPrefix: string;
  countryLabel?: string;
  cityLabel?: string;
  cityPlaceholder?: string;
  className?: string;
}

const DestinationField = React.forwardRef<DestinationFieldHandle, DestinationFieldProps>(
  ({ countryCode, city, onCountryChange, onCityChange, idPrefix, countryLabel = 'Destination', cityLabel, cityPlaceholder = 'City or region, e.g. Dubai', className }, ref) => {
    const countryId = `${idPrefix}-destination-country`;
    const cityId = `${idPrefix}-destination-city`;
    const countrySelectRef = useRef<HTMLSelectElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        countrySelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        countrySelectRef.current?.focus();
      },
    }));

    return (
      <div className={className}>
        <label htmlFor={countryId} className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
          {countryLabel}
        </label>
        <select
          id={countryId}
          ref={countrySelectRef}
          value={countryCode}
          onChange={(e) => {
            const code = e.target.value;
            const country = COUNTRIES.find((c) => c.code === code);
            onCountryChange(code, country?.name ?? '');
          }}
          className="w-full text-sm"
        >
          <option value="">Select a country…</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
        {cityLabel && (
          <label htmlFor={cityId} className="block text-xs font-semibold mb-1 mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {cityLabel}
          </label>
        )}
        <input
          id={cityId}
          type="text"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder={cityPlaceholder}
          className="w-full text-sm mt-1.5"
        />
      </div>
    );
  }
);

DestinationField.displayName = 'DestinationField';

export default DestinationField;
