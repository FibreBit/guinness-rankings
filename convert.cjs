const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('public/rankings.xlsx');
const sheet = workbook.Sheets['Pub Ratings'];
const data = XLSX.utils.sheet_to_json(sheet);

function parseDate(val) {
  if (!val || val === 'Unknown') return '';
  if (typeof val === 'string') return val;
  try {
    const date = new Date((val - 25569) * 86400 * 1000);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

function cleanNum(val) {
  if (val === 'Unknown' || val === '' || val === undefined || val === null) return '';
  return val;
}

const mapped = data.map((row, i) => ({
  id: i + 1,
  created_at: new Date().toISOString(),
  pub_name: row['Pub Name'] || '',
  location: row['Location'] || '',
  price: cleanNum(row['Price']),
  date_of_visit: parseDate(row['Date of Visit']),
  alumni_present: row['Alumni Present'] || '',
  taste: cleanNum(row['Taste']),
  texture: cleanNum(row['Texture']),
  stickage: cleanNum(row['Stickage ']),
  head_to_body_ratio: cleanNum(row['Head to Body Ratio']),
  pub_character: cleanNum(row['Pub Character']),
  overall_score: cleanNum(row['Overall Score']),
  comments: row['Comments'] || ''
}));

const newSheet = XLSX.utils.json_to_sheet(mapped);
const csv = XLSX.utils.sheet_to_csv(newSheet);
fs.writeFileSync('pub_ratings_import.csv', csv);
console.log('Created pub_ratings_import.csv with', mapped.length, 'rows');
