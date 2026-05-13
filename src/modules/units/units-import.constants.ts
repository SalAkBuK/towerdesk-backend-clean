import {
  FurnishedStatus,
  KitchenType,
  MaintenancePayer,
  PaymentFrequency,
  UnitSizeUnit,
} from '@prisma/client';

export const UNITS_IMPORT_BOOLEAN_VALUES = [
  'true',
  'false',
  'yes',
  'no',
  '1',
  '0',
  'y',
  'n',
] as const;

export const UNITS_IMPORT_ENUM_SETS = {
  unitSizeUnit: new Set(Object.values(UnitSizeUnit)),
  furnishedStatus: new Set(Object.values(FurnishedStatus)),
  kitchenType: new Set(Object.values(KitchenType)),
  paymentFrequency: new Set(Object.values(PaymentFrequency)),
  maintenancePayer: new Set(Object.values(MaintenancePayer)),
} as const;

export type UnitsImportFieldType =
  | 'text'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'enum';

export type UnitsImportFieldDefinition = {
  header: string;
  canonical: string;
  supportedInUpload: boolean;
  required: boolean;
  type: UnitsImportFieldType;
  acceptedValuesDescription?: string;
  example: string;
  notes: string;
};

export const UNITS_IMPORT_FIELDS: readonly UnitsImportFieldDefinition[] = [
  {
    header: 'label',
    canonical: 'label',
    supportedInUpload: true,
    required: true,
    type: 'text',
    acceptedValuesDescription: 'Any non-empty unique label',
    example: 'A-101',
    notes:
      'Required. Must be unique inside the CSV. In create mode it must also not already exist in the building.',
  },
  {
    header: 'floor',
    canonical: 'floor',
    supportedInUpload: true,
    required: false,
    type: 'integer',
    acceptedValuesDescription: 'Whole number, 0 or greater',
    example: '3',
    notes: 'Optional integer field.',
  },
  {
    header: 'unitType',
    canonical: 'unittype',
    supportedInUpload: true,
    required: false,
    type: 'text',
    acceptedValuesDescription: 'Any active unit type name in your org',
    example: 'Apartment',
    notes:
      'Resolved by name, case-insensitive after trimming. If the name is not found in the org, import fails for that row.',
  },
  {
    header: 'notes',
    canonical: 'notes',
    supportedInUpload: true,
    required: false,
    type: 'text',
    acceptedValuesDescription: 'Free text',
    example: 'Near elevator',
    notes: 'Optional free-text note.',
  },
  {
    header: 'bedrooms',
    canonical: 'bedrooms',
    supportedInUpload: true,
    required: false,
    type: 'integer',
    acceptedValuesDescription: 'Whole number, 0 or greater',
    example: '2',
    notes: 'Optional integer field.',
  },
  {
    header: 'bathrooms',
    canonical: 'bathrooms',
    supportedInUpload: true,
    required: false,
    type: 'integer',
    acceptedValuesDescription: 'Whole number, 0 or greater',
    example: '2',
    notes: 'Optional integer field.',
  },
  {
    header: 'unitSize',
    canonical: 'unitsize',
    supportedInUpload: true,
    required: false,
    type: 'number',
    acceptedValuesDescription: 'Number, 0 or greater',
    example: '950',
    notes: 'Optional decimal/number field.',
  },
  {
    header: 'unitSizeUnit',
    canonical: 'unitsizeunit',
    supportedInUpload: true,
    required: false,
    type: 'enum',
    acceptedValuesDescription: Object.values(UnitSizeUnit).join(' | '),
    example: 'SQ_FT',
    notes:
      'Case-insensitive. Spaces and hyphens are normalized to underscores before validation.',
  },
  {
    header: 'includedParkingSlots',
    canonical: 'includedparkingslots',
    supportedInUpload: false,
    required: false,
    type: 'integer',
    acceptedValuesDescription: 'Reserved for future support',
    example: '',
    notes:
      'Do not include this column in uploads. The current backend does not accept or process it.',
  },
  {
    header: 'furnishedStatus',
    canonical: 'furnishedstatus',
    supportedInUpload: true,
    required: false,
    type: 'enum',
    acceptedValuesDescription: Object.values(FurnishedStatus).join(' | '),
    example: 'SEMI_FURNISHED',
    notes:
      'Case-insensitive. Spaces and hyphens are normalized to underscores before validation.',
  },
  {
    header: 'balcony',
    canonical: 'balcony',
    supportedInUpload: true,
    required: false,
    type: 'boolean',
    acceptedValuesDescription: UNITS_IMPORT_BOOLEAN_VALUES.join(' | '),
    example: 'true',
    notes: 'Accepted boolean spellings are listed exactly in acceptedValues.',
  },
  {
    header: 'kitchenType',
    canonical: 'kitchentype',
    supportedInUpload: true,
    required: false,
    type: 'enum',
    acceptedValuesDescription: Object.values(KitchenType).join(' | '),
    example: 'OPEN',
    notes:
      'Case-insensitive. Spaces and hyphens are normalized to underscores before validation.',
  },
  {
    header: 'rentAnnual',
    canonical: 'rentannual',
    supportedInUpload: true,
    required: false,
    type: 'number',
    acceptedValuesDescription: 'Number, 0 or greater',
    example: '72000',
    notes: 'Optional decimal/number field.',
  },
  {
    header: 'paymentFrequency',
    canonical: 'paymentfrequency',
    supportedInUpload: true,
    required: false,
    type: 'enum',
    acceptedValuesDescription: Object.values(PaymentFrequency).join(' | '),
    example: 'MONTHLY',
    notes:
      'Case-insensitive. Spaces and hyphens are normalized to underscores before validation.',
  },
  {
    header: 'securityDepositAmount',
    canonical: 'securitydepositamount',
    supportedInUpload: true,
    required: false,
    type: 'number',
    acceptedValuesDescription: 'Number, 0 or greater',
    example: '5000',
    notes: 'Optional decimal/number field.',
  },
  {
    header: 'serviceChargePerUnit',
    canonical: 'servicechargeperunit',
    supportedInUpload: true,
    required: false,
    type: 'number',
    acceptedValuesDescription: 'Number, 0 or greater',
    example: '1200',
    notes: 'Optional decimal/number field.',
  },
  {
    header: 'vatApplicable',
    canonical: 'vatapplicable',
    supportedInUpload: true,
    required: false,
    type: 'boolean',
    acceptedValuesDescription: UNITS_IMPORT_BOOLEAN_VALUES.join(' | '),
    example: 'false',
    notes: 'Accepted boolean spellings are listed exactly in acceptedValues.',
  },
  {
    header: 'maintenancePayer',
    canonical: 'maintenancepayer',
    supportedInUpload: true,
    required: false,
    type: 'enum',
    acceptedValuesDescription: Object.values(MaintenancePayer).join(' | '),
    example: 'TENANT',
    notes:
      'Case-insensitive. Spaces and hyphens are normalized to underscores before validation.',
  },
  {
    header: 'electricityMeterNumber',
    canonical: 'electricitymeternumber',
    supportedInUpload: true,
    required: false,
    type: 'text',
    acceptedValuesDescription: 'Free text',
    example: 'ELEC-101',
    notes: 'Optional free-text meter identifier.',
  },
  {
    header: 'waterMeterNumber',
    canonical: 'watermeternumber',
    supportedInUpload: true,
    required: false,
    type: 'text',
    acceptedValuesDescription: 'Free text',
    example: 'WATER-101',
    notes: 'Optional free-text meter identifier.',
  },
  {
    header: 'gasMeterNumber',
    canonical: 'gasmeternumber',
    supportedInUpload: true,
    required: false,
    type: 'text',
    acceptedValuesDescription: 'Free text',
    example: 'GAS-101',
    notes: 'Optional free-text meter identifier.',
  },
] as const;

export const UNITS_IMPORT_ALLOWED_HEADERS = new Map<string, string>(
  UNITS_IMPORT_FIELDS.filter((field) => field.supportedInUpload).map(
    (field) => [field.canonical, field.header],
  ),
);

export const UNITS_IMPORT_TEMPLATE_HEADERS = UNITS_IMPORT_FIELDS.filter(
  (field) => field.supportedInUpload,
).map((field) => field.header);
