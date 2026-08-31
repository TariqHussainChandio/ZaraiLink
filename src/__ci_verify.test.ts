// Throwaway file to verify the frontend-ci workflow's typecheck step fails on a real type error.
// Deleted before this branch merges.
const wrongType: number = 'this is a string, not a number';

it('placeholder', () => {
  expect(wrongType).toBeTruthy();
});
