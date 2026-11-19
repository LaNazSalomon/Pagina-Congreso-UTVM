import { InternalServerErrorException } from '@nestjs/common';
import { ReconocimientoStorageService } from './reconocimiento-storage.service';

const mockGetBucket = jest.fn();
const mockCreateBucket = jest.fn();
const mockUpload = jest.fn();
const mockDownload = jest.fn();
const mockRemove = jest.fn();
const mockFrom = jest.fn(() => ({
  upload: mockUpload,
  download: mockDownload,
  remove: mockRemove,
}));

jest.mock('../../archivo_multimedia/services/supabase-client.factory', () => ({
  createSupabaseClient: () => ({
    storage: {
      getBucket: mockGetBucket,
      createBucket: mockCreateBucket,
      from: mockFrom,
    },
  }),
}));

describe('ReconocimientoStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBucket.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found' },
    });
    mockCreateBucket.mockResolvedValue({ data: {}, error: null });
    mockUpload.mockResolvedValue({ data: {}, error: null });
    mockDownload.mockResolvedValue({
      data: new Blob([Buffer.from('jpg')]),
      error: null,
    });
    mockRemove.mockResolvedValue({ error: null });
  });

  it('crea el bucket privado automáticamente al subir el primer JPG', async () => {
    const service = new ReconocimientoStorageService();
    const jpg = Buffer.from('jpg');
    await service.upload('congresos/1/general/v1.jpg', jpg);
    await service.upload('congresos/1/general/v2.jpg', jpg);
    expect(mockCreateBucket).toHaveBeenCalledTimes(1);
    expect(mockCreateBucket).toHaveBeenCalledWith(
      'congreso-reconocimientos',
      expect.objectContaining({
        public: false,
        allowedMimeTypes: ['image/jpeg'],
      }),
    );
    expect(mockUpload).toHaveBeenCalledWith(
      'congresos/1/general/v1.jpg',
      jpg,
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
  });

  it('rechaza un bucket existente que sea público', async () => {
    mockGetBucket.mockResolvedValue({ data: { public: true }, error: null });
    const service = new ReconocimientoStorageService();
    await expect(
      service.upload('v1.jpg', Buffer.from('jpg')),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('lee el JPG sin exponer una URL pública', async () => {
    const service = new ReconocimientoStorageService();
    await expect(service.download('v1.jpg')).resolves.toEqual(
      Buffer.from('jpg'),
    );
    expect(mockDownload).toHaveBeenCalledWith('v1.jpg');
  });
});
