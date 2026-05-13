import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseDocumentsRepo } from './lease-documents.repo';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeasesRepo } from './leases.repo';
import { StorageService } from '../../infra/storage/storage.service';

describe('LeaseDocumentsService (resident self-service)', () => {
  let leasesRepo: jest.Mocked<LeasesRepo>;
  let leaseDocumentsRepo: jest.Mocked<LeaseDocumentsRepo>;
  let storageService: jest.Mocked<StorageService>;
  let service: LeaseDocumentsService;

  beforeEach(() => {
    leasesRepo = {
      findActiveLeaseByResident: jest.fn(),
    } as unknown as jest.Mocked<LeasesRepo>;

    leaseDocumentsRepo = {
      listByLeaseId: jest.fn(),
    } as unknown as jest.Mocked<LeaseDocumentsRepo>;
    storageService = {
      getSignedUrl: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    service = new LeaseDocumentsService(
      leasesRepo,
      leaseDocumentsRepo,
      {} as LeaseActivityRepo,
      storageService,
    );
  });

  it('returns active lease documents for current resident', async () => {
    leasesRepo.findActiveLeaseByResident.mockResolvedValue({
      id: 'lease-1',
    } as never);
    leaseDocumentsRepo.listByLeaseId.mockResolvedValue([
      { id: 'doc-1', url: 'https://files.example/doc-1.pdf' } as never,
    ]);
    storageService.getSignedUrl.mockResolvedValue(
      'https://signed.example/doc-1',
    );

    const result = await service.listActiveResidentDocuments({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toEqual([
      { id: 'doc-1', url: 'https://files.example/doc-1.pdf' },
    ]);
    expect(leasesRepo.findActiveLeaseByResident).toHaveBeenCalledWith(
      'org-1',
      'resident-1',
    );
    expect(leaseDocumentsRepo.listByLeaseId).toHaveBeenCalledWith(
      'org-1',
      'lease-1',
    );
  });

  it('returns empty list when no active lease exists', async () => {
    leasesRepo.findActiveLeaseByResident.mockResolvedValue(null);

    const result = await service.listActiveResidentDocuments({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toEqual([]);
    expect(leaseDocumentsRepo.listByLeaseId).not.toHaveBeenCalled();
  });

  it('resolves storage urls for resident documents', async () => {
    leasesRepo.findActiveLeaseByResident.mockResolvedValue({
      id: 'lease-1',
    } as never);
    leaseDocumentsRepo.listByLeaseId.mockResolvedValue([
      { id: 'doc-1', url: 'storage://leases/doc-1.pdf' } as never,
    ]);
    storageService.getSignedUrl.mockResolvedValue(
      'https://signed.example/leases/doc-1.pdf',
    );

    const result = await service.listActiveResidentDocuments({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(storageService.getSignedUrl).toHaveBeenCalledWith({
      key: 'leases/doc-1.pdf',
    });
    expect(result).toEqual([
      { id: 'doc-1', url: 'https://signed.example/leases/doc-1.pdf' },
    ]);
  });
});
