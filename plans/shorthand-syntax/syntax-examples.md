## Group: Square Brackets []

Group things so that together they occupy one unit of time, relative to the other items in the string

| Input                 | Output                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| "0 [0 2 3]"           | [[0, null, null, 0, 2, 3]]                                                           |
| "60 71 [64 67]!2"     | [[60, null, 71, null, 64, 67, 64, 67]]                                               |
| "60 64 71 [64 67]\*2" | [[60, null, null, null, 64, null, null, null, 71, null, null, null, 64, 67, 64, 67]] |

## Alternate: Angle Brackets <>

Alternate choices across cycles

| Input          | Output               |
| -------------- | -------------------- |
| "0 <2 3>"      | [[0, 2], [0, 3]]     |
| "[0 <2 3>]\*2" | [[0, 2, 0, 3]]       |
| "<0 <2 3>>"    | [[0], [2], [0], [3]] |
| "<0 <2 3>>\*2" | [[0, 2], [0, 3]]     |

## Accelerate: Asterisk \*

Accelerate a sequence within its allotted time

| Input      | Output                         |
| ---------- | ------------------------------ |
| "60\*3 67" | [[60, 60, 60, 67, null, null]] |

## Slow: Slash /

Slow a sequence, extending it across more time

| Input            | Output           |
| ---------------- | ---------------- |
| "<[0 2 4 6]>/2"" | [[0, 2], [4, 6]] |

## Repeat: Exclamation mark !

Repeat an item structurally

| Input     | Output             |
| --------- | ------------------ |
| "60!3 67" | [[60, 60, 60, 67]] |

## Stretch: At Symbol @

Stretch an item's relative duration/weight

| Input          | Output              |
| -------------- | ------------------- |
| "<0@2 2 3>"    | [[0], [0],[2], [3]] |
| "<0@2 2 3>\*2" | [[0], [2, 3]]       |

## Rests: Tilda ~

Stretch an item's relative duration/weight

| Input           | Output                                 |
| --------------- | -------------------------------------- |
| "[0 [~ 2] 4 6]" | [[0, null, null, 2, 4, null, 6, null]] |

## Polyphony: Comma ,

Play multiple notes at the same time. Polyphonic notes must be grouped with [].

| Input     | Output        |
| --------- | ------------- |
| "[0,2,4]" | [[[0, 2, 4]]] |
