const validImages = [{id: 'abc'}, {id: 'def'}];
const results = [{id: 'abc', tags: ['t1']}, {id: 'wrong', tags: ['t2']}];

const mapped = results.map((r, index) => {
    const originalImage = validImages[index];
    const matchedImage = validImages.find(img => img.id === r?.id) || originalImage;
    return {
        id: matchedImage?.id ? String(matchedImage.id) : 'unknown',
        tags: r.tags
    };
});
console.log(mapped);
