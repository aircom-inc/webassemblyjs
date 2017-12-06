// @flow

const TRAPPED = 'TRAPPED';

const {binop} = require('./instruction/binop');
const i32 = require('../runtime/values/i32');
const {createStackFrame} = require('./stackframe');

export function executeStackFrame(frame: StackFrame, depth: number = 0): any {
  let pc = 0;

  function getLocal(index: number) {
    const local = frame.locals[index];

    if (typeof local === 'undefined') {
      throw new Error('Assertion error: no local value at index ' + index);
    }

    frame.values.push(local);
  }

  function setLocal(index: number, value: StackLocal) {
    frame.locals[index] = value;
  }

  function pushResult(res: StackLocal) {
    frame.values.push(res);
  }

  // FIXME(sven): assert that the values are of the same type
  // > Assert: due to validation, two values of value type t are on the top of the stack
  function pop2(): [any, any] {
    assertNItemsOnStack(frame.values, 2);

    const c2 = frame.values.pop();
    const c1 = frame.values.pop();

    return [c1, c2];
  }

  while (pc < frame.code.length) {
    const instruction = frame.code[pc];

    switch (instruction.id) {

    case 'i32.const': {
      // https://webassembly.github.io/spec/exec/instructions.html#exec-const

      const n = instruction.args[0];

      if (typeof n === 'undefined') {
        throw new Error('i32.const requires one argument, none given.');
      }

      pushResult(
        i32.createValue(n)
      );

      break;
    }

    /**
     * Control Instructions
     *
     * https://webassembly.github.io/spec/exec/instructions.html#control-instructions
     */
    case 'nop': {
      // Do nothing
      // https://webassembly.github.io/spec/exec/instructions.html#exec-nop
      break;
    }

    case 'loop': {
      // https://webassembly.github.io/spec/exec/instructions.html#exec-loop
      const loop = instruction;

      if (loop.instr.length > 0) {
        const childStackFrame = createStackFrame(loop.instr, frame.locals);
        childStackFrame.trace = frame.trace;

        const res = executeStackFrame(childStackFrame, depth + 1);

        if (res === TRAPPED) {
          return;
        }
      }

      break;
    }

    /**
     * Administrative Instructions
     *
     * https://webassembly.github.io/spec/exec/runtime.html#administrative-instructions
     */
    case 'trap': {
      // signalling abrupt termination
      // https://webassembly.github.io/spec/exec/runtime.html#syntax-trap
      return TRAPPED;
    }

    /**
     * Memory Instructions
     *
     * https://webassembly.github.io/spec/exec/instructions.html#memory-instructions
     */
    case 'get_local': {
      // https://webassembly.github.io/spec/exec/instructions.html#exec-get-local
      const index = instruction.args[0];

      if (typeof index === 'undefined') {
        throw new Error('get_local requires one argument, none given.');
      }

      getLocal(index);

      break;
    }

    case 'set_local': {
      // https://webassembly.github.io/spec/exec/instructions.html#exec-set-local
      const index = instruction.args[0];
      const init = instruction.args[1];

      if (init.type === 'Instr') {
        const childStackFrame = createStackFrame([init], frame.locals);
        childStackFrame.trace = frame.trace;

        const res = executeStackFrame(childStackFrame, depth + 1);

        if (res === TRAPPED) {
          return;
        }

        setLocal(index, res);
      }

      break;
    }

    /**
     * Numeric Instructions
     *
     * https://webassembly.github.io/spec/exec/instructions.html#numeric-instructions
     */
    case 'i32.add': {
      const [c1, c2] = pop2();

      pushResult(
        binop(c2, c1, '+')
      );

      break;
    }

    case 'i32.sub': {
      const [c1, c2] = pop2();

      pushResult(
        binop(c2, c1, '-')
      );

      break;
    }

    case 'i32.mul': {
      const [c1, c2] = pop2();

      pushResult(
        binop(c2, c1, '*')
      );

      break;
    }

    default:
      // FIXME(sven): this is not spec compliant but great while developing
      throw new Error('Unknown operation: ' + instruction.type + ' (' + instruction.id + ')');
    }

    if (typeof frame.trace === 'function') {
      frame.trace(depth, pc, instruction);
    }

    pc++;
  }

  // Return the item on top of the values/stack;
  if (frame.values.length > 0) {
    return frame.values.pop();
  }
}

function assertNItemsOnStack(stack: Array<any>, numberOfItem: number) {
  if (stack.length < numberOfItem) {
    throw new Error('Assertion error: expected ' + numberOfItem + ' on the stack');
  }
}