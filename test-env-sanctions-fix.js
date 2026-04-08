/**
 * Test script to verify the environmental sanctions word matching fix
 * This simulates the new logic that requires at least 2 words to match
 */

// Mock environmental sanctions data
const mockSanctions = [
  { _id: '1', nombre: 'COMERCIALIZADORA KEILA OYARZUN E.I.R.L.' },
  { _id: '2', nombre: 'COMERCIALIZADORA CENTRAL LTDA' },
  { _id: '3', nombre: 'NUTRECO INTERNACIONAL SA' },
  { _id: '4', nombre: 'CHILE MINING CORP' },
  { _id: '5', nombre: 'COMERCIALIZADORA NUTRECO CHILE SPA' },
  { _id: '6', nombre: 'KEILA COMERCIALIZADORA LTDA' },
  { _id: '7', nombre: 'NUTRECO CHILE DISTRIBUIDORA' }
];

// Simulate the word-based search logic
function simulateWordBasedSearch(razonSocial, sanctions) {
  console.log(`\n=== Testing Environmental Sanctions Word Matching ===`);
  console.log(`Search term: "${razonSocial}"`);
  
  // Extract words (same logic as in the fix)
  const words = razonSocial.split(/\s+/).filter((word) => 
    word.length > 3 && 
    !['SPA', 'LTDA', 'SA', 'SOCIEDAD', 'ANONIMA', 'LIMITADA', 'DE', 'LA', 'EL', 'Y', 'DEL'].includes(word.toUpperCase())
  );
  
  console.log(`Filtered words: ${JSON.stringify(words)}`);
  
  // Track word matches for each potential sanction
  const wordMatchCounts = new Map();
  
  for (const word of words) {
    console.log(`\nSearching for word: "${word}"`);
    
    // Find sanctions that contain this word (case-insensitive)
    const wordSanctions = sanctions.filter(sanction => 
      sanction.nombre.toLowerCase().includes(word.toLowerCase())
    );
    
    console.log(`  Found ${wordSanctions.length} sanctions containing "${word}"`);
    
    // Track matches for each sanction
    for (const sanction of wordSanctions) {
      const sanctionId = sanction._id;
      if (!wordMatchCounts.has(sanctionId)) {
        wordMatchCounts.set(sanctionId, { sanction, matchedWords: [] });
      }
      wordMatchCounts.get(sanctionId).matchedWords.push(word);
      console.log(`    - "${sanction.nombre}"`);
    }
  }
  
  console.log(`\n=== Word Match Analysis ===`);
  
  // Show all sanctions and their word match counts
  for (const [sanctionId, entry] of wordMatchCounts.entries()) {
    console.log(`Sanction: "${entry.sanction.nombre}"`);
    console.log(`  Matched words (${entry.matchedWords.length}): ${entry.matchedWords.join(', ')}`);
    console.log(`  Meets requirement (≥2 words): ${entry.matchedWords.length >= 2 ? 'YES' : 'NO'}`);
  }
  
  // Filter sanctions that have at least 2 word matches
  const validSanctions = Array.from(wordMatchCounts.values())
    .filter(entry => entry.matchedWords.length >= 2)
    .map(entry => entry.sanction);
  
  console.log(`\n=== Final Results ===`);
  if (validSanctions.length > 0) {
    console.log(`Found ${validSanctions.length} sanctions with at least 2 word matches:`);
    
    Array.from(wordMatchCounts.values())
      .filter(entry => entry.matchedWords.length >= 2)
      .forEach((entry, index) => {
        console.log(`  ${index + 1}. "${entry.sanction.nombre}" (matched words: ${entry.matchedWords.join(', ')})`);
      });
  } else {
    console.log(`No sanctions found with at least 2 word matches`);
  }
  
  return validSanctions;
}

// Test cases
console.log('Testing Environmental Sanctions Word Matching Fix');
console.log('='.repeat(60));

// Test case 1: The original example from the logs
const testCase1 = 'COMERCIALIZADORA NUTRECO CHILE';
const results1 = simulateWordBasedSearch(testCase1, mockSanctions);

// Test case 2: A case that should match (has exact match in database)
console.log('\n' + '='.repeat(60));
const testCase2 = 'COMERCIALIZADORA NUTRECO CHILE SPA';
const results2 = simulateWordBasedSearch(testCase2, mockSanctions);

// Test case 3: A case with only one word match (should not match)
console.log('\n' + '='.repeat(60));
const testCase3 = 'COMERCIALIZADORA EXAMPLE COMPANY';
const results3 = simulateWordBasedSearch(testCase3, mockSanctions);

// Test case 4: A case with no matches
console.log('\n' + '='.repeat(60));
const testCase4 = 'EXAMPLE COMPANY TESTING LTDA';
const results4 = simulateWordBasedSearch(testCase4, mockSanctions);

console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log(`Test 1 (${testCase1}): ${results1.length} matches`);
console.log(`Test 2 (${testCase2}): ${results2.length} matches`);
console.log(`Test 3 (${testCase3}): ${results3.length} matches`);
console.log(`Test 4 (${testCase4}): ${results4.length} matches`);

console.log('\nExpected behavior:');
console.log('- Test 1 should find 1 match (COMERCIALIZADORA NUTRECO CHILE SPA)');
console.log('- Test 2 should find 1 match (exact match)');
console.log('- Test 3 should find 0 matches (only 1 word matches)');
console.log('- Test 4 should find 0 matches (no words match)');