const OUTPUT_SIZE = 400;

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (e) => reject(e));
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });
}

/**
 * Recorta uma imagem com base na area retornada pelo react-easy-crop.
 * Retorna um Blob JPEG de OUTPUT_SIZE x OUTPUT_SIZE.
 */
export async function getCroppedBlob(imageSrc, pixelCrop, outputSize = OUTPUT_SIZE) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Falha ao gerar imagem recortada'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.9
    );
  });
}
