export interface RecognitionBox {
  x: number;
  yFromTop: number;
  width: number;
  height: number;
  size: number;
}

export interface RecognitionLayout {
  nameBox: RecognitionBox;
  detailBoxes: RecognitionBox[];
  pageWidth?: number;
  pageHeight?: number;
}
