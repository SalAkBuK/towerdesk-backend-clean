import { PrismaService } from '../../infra/prisma/prisma.service';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseHistoryRepo } from './lease-history.repo';
import { LeasesRepo } from './leases.repo';
import { LeasesService } from './leases.service';

describe('LeasesService (resident self-service)', () => {
  let leasesRepo: jest.Mocked<LeasesRepo>;
  let leasesService: LeasesService;

  beforeEach(() => {
    leasesRepo = {
      findActiveLeaseByResident: jest.fn(),
    } as unknown as jest.Mocked<LeasesRepo>;

    leasesService = new LeasesService(
      {} as PrismaService,
      {} as BuildingsRepo,
      {} as UnitsRepo,
      leasesRepo,
      {} as LeaseHistoryRepo,
      {} as LeaseActivityRepo,
    );
  });

  it('returns active lease for current resident', async () => {
    const lease = { id: 'lease-1' };
    leasesRepo.findActiveLeaseByResident.mockResolvedValue(lease as never);

    const result = await leasesService.getActiveLeaseForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toBe(lease);
    expect(leasesRepo.findActiveLeaseByResident).toHaveBeenCalledWith(
      'org-1',
      'resident-1',
    );
  });

  it('returns null when resident has no active lease', async () => {
    leasesRepo.findActiveLeaseByResident.mockResolvedValue(null);

    const result = await leasesService.getActiveLeaseForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toBeNull();
  });
});
