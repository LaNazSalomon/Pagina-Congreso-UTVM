import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ReconocimientoTipo } from '../enums/reconocimiento-tipo.enum';
import { ReconocimientoRendererService } from './reconocimiento-renderer.service';

describe('ReconocimientoRendererService', () => {
  const service = new ReconocimientoRendererService();
  const imagePath = join(__dirname, '__fixtures__', 'portrait.jpg');
  const template = async (detailCount = 0) => ({
    image: await readFile(imagePath),
    layout: {
      pageWidth: 384.125,
      pageHeight: 768.25,
      nameBox: { x: 20, yFromTop: 300, width: 340, height: 38, size: 24 },
      detailBoxes: Array.from({ length: detailCount }, (_, index) => ({
        x: 20,
        yFromTop: 350 + index * 40,
        width: 340,
        height: 30,
        size: 17,
      })),
    },
  });

  it.each([
    [ReconocimientoTipo.GENERAL, 'María José Hernández'],
    [ReconocimientoTipo.TALLERISTA, 'Óscar Núñez'],
    [
      ReconocimientoTipo.CONFERENCISTA,
      'María Fernanda de los Ángeles Hernández González del Valle',
    ],
  ])('genera un PDF válido para %s', async (tipo, nombre) => {
    const pdf = await service.render(tipo, nombre, {}, await template());

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({
      width: 384.125,
      height: 768.25,
    });
  });

  it('renderiza los datos nominales de premiación y evaluación', async () => {
    const awardTemplate = await template(2);
    const evaluatorTemplate = await template(1);
    const [premiacion, evaluador] = await Promise.all([
      service.render(
        ReconocimientoTipo.HACKATON_PREMIACION,
        'Ana Pérez',
        { equipo: 'Bit Force', resultado: 'Primer lugar' },
        awardTemplate,
      ),
      service.render(
        ReconocimientoTipo.HACKATON_EVALUADOR,
        'Luis Díaz',
        { participacion: 'Participación como evaluador de Innova 2026' },
        evaluatorTemplate,
      ),
    ]);
    expect(premiacion.subarray(0, 5).toString()).toBe('%PDF-');
    expect(evaluador.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('crea el PDF con la proporción de una plantilla vertical', async () => {
    const image = await readFile(imagePath);
    const pdf = await service.render(
      ReconocimientoTipo.GENERAL,
      'María José Hernández Pérez',
      {},
      {
        image,
        layout: {
          pageWidth: 384.125,
          pageHeight: 768.25,
          nameBox: { x: 20, yFromTop: 300, width: 340, height: 38, size: 24 },
          detailBoxes: [],
        },
      },
    );
    const document = await PDFDocument.load(pdf);
    expect(document.getPage(0).getSize()).toEqual({
      width: 384.125,
      height: 768.25,
    });
  });
});
