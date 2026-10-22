# Seven-segment trained data

`ssd_int.traineddata` is the integer ("fast") Tesseract model for seven-segment displays from
[fabiocmazzo/tessdata_ssd](https://github.com/fabiocmazzo/tessdata_ssd), licensed under the Apache License 2.0.
It is used unchanged by the on-device blood pressure photo reader (`src/lib/bp-ocr.ts`) and copied to `public/ocr`
before each build by `scripts/copy-ocr.mjs`.
