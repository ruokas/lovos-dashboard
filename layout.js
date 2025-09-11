// Bed layout configuration for Lovos Dashboard.
// Each object maps a bed identifier to its grid row and column.
// Columns:
// 1: Beds 1-8
// 2: Beds 9-12
// 3: Beds 13-17
// 4: IT1-IT2
// 5: 121A-121B
export const bedLayout = [
  // Column 1: beds 1-8
  { id: '1', row: 1, col: 1 },
  { id: '2', row: 2, col: 1 },
  { id: '3', row: 3, col: 1 },
  { id: '4', row: 4, col: 1 },
  { id: '5', row: 5, col: 1 },
  { id: '6', row: 6, col: 1 },
  { id: '7', row: 7, col: 1 },
  { id: '8', row: 8, col: 1 },

  // Column 2: beds 9-12
  { id: '9', row: 1, col: 2 },
  { id: '10', row: 2, col: 2 },
  { id: '11', row: 3, col: 2 },
  { id: '12', row: 4, col: 2 },

  // Column 3: beds 13-17
  { id: '13', row: 1, col: 3 },
  { id: '14', row: 2, col: 3 },
  { id: '15', row: 3, col: 3 },
  { id: '16', row: 4, col: 3 },
  { id: '17', row: 5, col: 3 },

  // Column 4: IT beds
  { id: 'IT1', row: 1, col: 4 },
  { id: 'IT2', row: 2, col: 4 },

  // Column 5: 121A-121B
  { id: '121A', row: 1, col: 5 },
  { id: '121B', row: 2, col: 5 }
];
