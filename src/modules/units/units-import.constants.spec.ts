import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCsv } from '../../common/utils/csv';
import {
  UNITS_IMPORT_FIELDS,
  UNITS_IMPORT_TEMPLATE_HEADERS,
} from './units-import.constants';

describe('units import assets', () => {
  const repoRoot = resolve(__dirname, '../../..');

  it('keeps the upload template header aligned with supported import headers', () => {
    const templatePath = resolve(repoRoot, 'units_template_fixed.csv');
    const templateCsv = readFileSync(templatePath, 'utf-8').trim();

    expect(templateCsv).toBe(UNITS_IMPORT_TEMPLATE_HEADERS.join(','));
    expect(templateCsv).not.toContain('includedParkingSlots');
  });

  it('keeps the field reference aligned with the supported import fields', () => {
    const referencePath = resolve(repoRoot, 'units_import_reference.csv');
    const referenceCsv = readFileSync(referencePath, 'utf-8');
    const parsed = parseCsv(referenceCsv);

    expect(parsed.headers).toEqual([
      'field',
      'required',
      'type',
      'acceptedValues',
      'example',
      'notes',
    ]);

    const supportedFields = UNITS_IMPORT_FIELDS.filter(
      (field) => field.supportedInUpload,
    );

    expect(parsed.rows).toHaveLength(supportedFields.length);

    expect(parsed.rows).toEqual(
      supportedFields.map((field) => ({
        field: field.header,
        required: field.required ? 'yes' : 'no',
        type: field.type,
        acceptedValues: field.acceptedValuesDescription ?? '',
        example: field.example,
        notes: field.notes,
      })),
    );
  });
});
