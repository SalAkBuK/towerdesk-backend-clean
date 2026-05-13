import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { BuildingsController } from '../src/modules/buildings/buildings.controller';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { BuildingsService } from '../src/modules/buildings/buildings.service';

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
  city: string;
  emirate?: string | null;
  country: string;
  timezone: string;
  floors?: number | null;
  unitsCount?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryBuildingsRepo {
  private records: BuildingRecord[] = [];

  reset() {
    this.records = [];
  }

  async create(
    orgId: string,
    data: {
      name: string;
      city: string;
      emirate?: string | null;
      country: string;
      timezone: string;
      floors?: number | null;
      unitsCount?: number | null;
    },
  ): Promise<BuildingRecord> {
    const now = new Date();
    const record: BuildingRecord = {
      id: randomUUID(),
      orgId,
      name: data.name,
      city: data.city,
      emirate: data.emirate ?? null,
      country: data.country,
      timezone: data.timezone,
      floors: data.floors ?? null,
      unitsCount: data.unitsCount ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return record;
  }

  async listByOrg(orgId: string): Promise<BuildingRecord[]> {
    return this.records.filter((record) => record.orgId === orgId);
  }

  async deleteByIdForOrg(orgId: string, buildingId: string): Promise<number> {
    const index = this.records.findIndex(
      (record) => record.orgId === orgId && record.id === buildingId,
    );
    if (index === -1) {
      return 0;
    }

    this.records.splice(index, 1);
    return 1;
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const orgHeader = request.headers['x-org-id'];
    const orgId = Array.isArray(orgHeader) ? orgHeader[0] : orgHeader;
    request.user = {
      sub: 'user-1',
      email: 'user@example.com',
      orgId: orgId ?? undefined,
    };
    return true;
  }
}

@Injectable()
class AllowPermissionsGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Org Buildings (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let repo: InMemoryBuildingsRepo;

  beforeAll(async () => {
    repo = new InMemoryBuildingsRepo();

    const moduleRef = await Test.createTestingModule({
      controllers: [BuildingsController],
      providers: [
        BuildingsService,
        OrgScopeGuard,
        {
          provide: BuildingsRepo,
          useValue: repo,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowPermissionsGuard)
      .overrideGuard(BuildingAccessGuard)
      .useClass(AllowPermissionsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    repo.reset();
  });

  it('prevents org-b from seeing org-a buildings', async () => {
    const createResponse = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({ name: 'Alpha Tower', city: 'Dubai' }),
    });

    expect(createResponse.status).toBe(201);

    const orgAResponse = await fetch(`${baseUrl}/org/buildings`, {
      headers: { 'x-org-id': 'org-a' },
    });

    expect(orgAResponse.status).toBe(200);
    const orgABody = await orgAResponse.json();
    expect(orgABody).toHaveLength(1);
    expect(orgABody[0].orgId).toBe('org-a');

    const orgBResponse = await fetch(`${baseUrl}/org/buildings`, {
      headers: { 'x-org-id': 'org-b' },
    });

    expect(orgBResponse.status).toBe(200);
    const orgBBody = await orgBResponse.json();
    expect(orgBBody).toHaveLength(0);
  });

  it('rejects org endpoints without orgId', async () => {
    const response = await fetch(`${baseUrl}/org/buildings`);
    expect(response.status).toBe(403);

    const createResponse = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Gamma Tower', city: 'Dubai' }),
    });
    expect(createResponse.status).toBe(403);
  });

  it('rejects orgId from client body', async () => {
    const response = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({
        name: 'Gamma Tower',
        city: 'Dubai',
        orgId: 'org-b',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('creates building with defaults from minimal payload', async () => {
    const response = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({ name: 'Marina Heights', city: 'Dubai' }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe('Marina Heights');
    expect(body.city).toBe('Dubai');
    expect(body.country).toBe('ARE');
    expect(body.timezone).toBe('Asia/Dubai');
  });

  it('creates building with full payload', async () => {
    const response = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({
        name: 'Marina Heights Tower A',
        city: 'Dubai',
        emirate: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
        floors: 45,
        unitsCount: 380,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.emirate).toBe('Dubai');
    expect(body.floors).toBe(45);
    expect(body.unitsCount).toBe(380);
  });

  it('deletes only the current org building', async () => {
    const createResponse = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({ name: 'Delete Me', city: 'Dubai' }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const wrongOrgDelete = await fetch(
      `${baseUrl}/org/buildings/${created.id}`,
      {
        method: 'DELETE',
        headers: { 'x-org-id': 'org-b' },
      },
    );
    expect(wrongOrgDelete.status).toBe(404);

    const deleteResponse = await fetch(
      `${baseUrl}/org/buildings/${created.id}`,
      {
        method: 'DELETE',
        headers: { 'x-org-id': 'org-a' },
      },
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetch(`${baseUrl}/org/buildings`, {
      headers: { 'x-org-id': 'org-a' },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(0);
  });

  it('returns not found when deleting a missing building', async () => {
    const response = await fetch(`${baseUrl}/org/buildings/${randomUUID()}`, {
      method: 'DELETE',
      headers: { 'x-org-id': 'org-a' },
    });

    expect(response.status).toBe(404);
  });

  it('rejects missing city', async () => {
    const response = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({ name: 'No City' }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects floors or unitsCount below 1', async () => {
    const floorsResponse = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({ name: 'Bad Floors', city: 'Dubai', floors: 0 }),
    });
    expect(floorsResponse.status).toBe(400);

    const unitsResponse = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': 'org-a',
      },
      body: JSON.stringify({ name: 'Bad Units', city: 'Dubai', unitsCount: 0 }),
    });
    expect(unitsResponse.status).toBe(400);
  });
});
