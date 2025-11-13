/**
 * BMW CarData Telematic Key Extractor
 *
 * Extract telematic keys and descriptions from BMW CarData documentation page.
 *
 * USAGE:
 * 1. Open BMW CarData API documentation page in browser
 * 2. Open browser DevTools Console (F12)
 * 3. Paste this entire script and press Enter
 * 4. Copy the output from console
 *
 * OUTPUT: JSON array with descriptions
 */

(function extractTelematicKeys() {
  console.log('🔍 BMW CarData Telematic Key Extractor\n');
  console.log('Scanning page for telematic descriptors...\n');

  const results = [];

  // Target the specific attributes table
  const table = document.querySelector('#attributesTable');

  if (!table) {
    console.error('❌ Could not find #attributesTable');
    console.log('💡 Make sure you are on the BMW CarData API documentation page');
    return;
  }

  // Extract from table rows
  const rows = table.querySelectorAll('tr[role="row"]');
  console.log(`Found ${rows.length} table rows\n`);

  rows.forEach((row, index) => {
    try {
      // First cell contains the key in a <p> tag with class "chakra-text css-fl8gfp"
      const keyCell = row.querySelector('td:first-child p.chakra-text');
      // Second cell contains the description in a <p> tag with class "chakra-text css-9u85d6"
      const descCell = row.querySelector('td:nth-child(2) p.chakra-text');

      if (keyCell && descCell) {
        const key = keyCell.textContent.trim();
        const description = descCell.textContent.trim();

        // Validate key format (should start with "vehicle.")
        if (key.startsWith('vehicle.')) {
          results.push({ key, description });
        }
      }
    } catch (e) {
      console.warn(`⚠️ Error processing row ${index}:`, e.message);
    }
  });

  // Sort by key name
  const sortedResults = results.sort((a, b) => a.key.localeCompare(b.key));

  console.log(`✅ Found ${sortedResults.length} telematic keys\n`);

  if (sortedResults.length === 0) {
    console.error('❌ No telematic keys found!');
    return;
  }

  // Output JSON array with descriptions
  console.log('='.repeat(80));
  console.log('📋 JSON Array with Descriptions');
  console.log('='.repeat(80));
  console.log(JSON.stringify(sortedResults, null, 2));
  console.log('\n' + '='.repeat(80));
  console.log('✨ Extraction complete! Copy the JSON array above.');
  console.log('='.repeat(80));

  // Return for programmatic access
  return sortedResults;
})();
