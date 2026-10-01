/* Kitty Chomp maze (original design, 21 x 21 tiles)
 *   #  wall          .  kitty treat (10 pts)
 *   o  catnip        ' ' open floor
 *   -  dog-house door   G  inside the dog house
 * Row 9 wraps around at both edges (the tunnel).
 */
export const MAZE = [
  '#####################',
  '#.........#.........#',
  '#o##.####.#.####.##o#',
  '#...................#',
  '#.##.#.#######.#.##.#',
  '#....#....#....#....#',
  '####.####.#.####.####',
  '####.#.... ....#.####',
  '####.#.###-###.#.####',
  '   ....#GGGGG#....   ',
  '####.#.#######.#.####',
  '####.#.... ....#.####',
  '####.#.#######.#.####',
  '#.........#.........#',
  '#.##.####.#.####.##.#',
  '#o.#...... ......#.o#',
  '##.#.#.#######.#.#.##',
  '#....#....#....#....#',
  '#.#######.#.#######.#',
  '#...................#',
  '#####################',
];

export const COLS = MAZE[0].length;
export const ROWS = MAZE.length;
export const TUNNEL_ROW = MAZE.findIndex((row) => row[0] !== '#');
