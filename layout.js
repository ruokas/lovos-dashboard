// Bed layout configuration for Lovos Dashboard.
// Each object maps a bed identifier to its grid row and column.
// Rows:
// 1: Beds 1-8
// 2: Beds 9-12
// 3: Beds 13-17
// 4: IT1-IT2
// 5: 121A-121B
export const bedLayout = [
  // Row 1: beds 1-8
  { id: '1', row: 1, col: 1 },
  { id: '2', row: 1, col: 2 },
  { id: '3', row: 1, col: 3 },
  { id: '4', row: 1, col: 4 },
  { id: '5', row: 1, col: 5 },
  { id: '6', row: 1, col: 6 },
  { id: '7', row: 1, col: 7 },
  { id: '8', row: 1, col: 8 },

  // Row 2: beds 9-12
  { id: '9', row: 2, col: 1 },
  { id: '10', row: 2, col: 2 },
  { id: '11', row: 2, col: 3 },
  { id: '12', row: 2, col: 4 },

  // Row 3: beds 13-17
  { id: '13', row: 3, col: 1 },
  { id: '14', row: 3, col: 2 },
  { id: '15', row: 3, col: 3 },
  { id: '16', row: 3, col: 4 },
  { id: '17', row: 3, col: 5 },

  // Row 4: IT beds
  { id: 'IT1', row: 4, col: 1 },
  { id: 'IT2', row: 4, col: 2 },

  // Row 5: 121A-121B
  { id: '121A', row: 5, col: 1 },
  { id: '121B', row: 5, col: 2 }
];
