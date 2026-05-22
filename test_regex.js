const text = `
<rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
    xmlns:exif="http://ns.adobe.com/exif/1.0/"
    xmlns:drone-dji="http://www.dji.com/drone-dji/1.0/"
    tiff:Make="DJI"
    tiff:Model="FC3411"
    drone-dji:AbsoluteAltitude="+26.11"
/>
`;
const makeMatch = text.match(/(?:tiff:Make|drone-dji:Make)[=">\s]+([^"<]+)/i);
const modelMatch = text.match(/(?:tiff:Model|drone-dji:Model)[=">\s]+([^"<]+)/i);
console.log('Make:', makeMatch ? makeMatch[1] : null);
console.log('Model:', modelMatch ? modelMatch[1] : null);
