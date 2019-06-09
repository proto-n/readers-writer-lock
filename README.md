# readers-writer-lock
Javascript implementation of a readers-writer lock for async/await.

This package is useful for coordinating multiple async "read" and "write" processes, where the reads can run concurrently, but write processes must exclude all other read and write processes.

# Usage example

```javascript
const {RWLock, sleep} = require('readers-writer-lock')

!async function(){
	let lock = new RWLock()

	let read1 = lock.read(async function(){
		console.log('read1 start')
		await sleep(1000)
		console.log('read1 end')
	})
	let read2 = lock.read(async function(){
		console.log('read2 start')
		await sleep(1000)
		console.log('read2 end')
	})
	let write1 = lock.write(async function(){
		console.log('write1 start')
		await sleep(1000)
		console.log('write1 end')
	})
	let write2 = lock.write(async function(){
		console.log('write2 start')
		await sleep(1000)
		console.log('write2 end')
	})
	let read3 = lock.read(async function(){
		console.log('read3 start')
		await sleep(1000)
		console.log('read3 end')
	})
	await Promise.all([read1, read2, read3, write1, write2])
}()
```

Output:
```
read1 start
read2 start
read1 end
read2 end
write1 start
write1 end
write2 start
write2 end
read3 start
read3 end
```

# Behavior
- The locks are unlocked when the given function returns or throws. Return values are returned by the lock function as a promise. Thrown errors are re-thrown by the lock function.
```javascript
let res = await lock.read(async function(){
	return 1
})
//res == 1

try{
	await lock.read(async function(){
		throw 1
	})
} catch(e) {
	// e == 1
}
```
- The functions are executed in call order. This may not result in the shortest overall runtime (obv. grouping more read operations is faster), but it doesn't starve either reads or writes.
- Multiple locks can be created without problem, each working independent of each other.

# Other implemented classes

## Lock

Simple lock, with similar behavior to RWLock
```javascript
const {Lock, sleep} = require('readers-writer-lock')

!async function(){
	let lock = new Lock()
	let task1 = lock.run(async function(){
		console.log('run 1 start')
		await sleep(1000)
		console.log('run 1 end')
	})
	let task2 = lock.run(async function(){
		console.log('run 2 start')
		await sleep(1000)
		console.log('run 2 end')
	})
	await Promise.all([task1, task2])
}()
```

Output:
```
run 1 start
run 1 end
run 2 start
run 2 end
```

## CombinedLock

When you need multiple locks for a given piece of code, you can combine them using either `combine([lock1, lock2, ...])` or `new CombinedLock([lock1, lock2, ...])`.

Example:
```javascript
const {Lock, combine, sleep} = require('readers-writer-lock')

!async function(){
	let lock1 = new Lock()
	let lock2 = new Lock()

	let task1 = lock1.run(async function(){
		console.log('lock1 run1 start')
		await sleep(1000)
		console.log('lock1 run1 end')
	})
	let task2 = lock2.run(async function(){
		console.log('lock2 run1 start')
		await sleep(1000)
		console.log('lock2 run1 end')
	})
	let task3 = lock1.run(async function(){
		console.log('lock1 run2 start')
		await sleep(1000)
		console.log('lock1 run2 end')
	})
	let task4 = combine([lock1, lock2]).run(async function(){
		console.log('combined lock run start')
		await sleep(1000)
		console.log('combined lock run end')
	})
	await Promise.all([task1, task2, task3, task4])
}()
```

Output:
```
lock1 run1 start
lock2 run1 start
lock1 run1 end
lock2 run1 end
lock1 run2 start
lock1 run2 end
combined lock run start
combined lock run end
```

All created locks are ordered by instantiation order, and the required locks are acquired according to this order. This avoids deadlocks, however it can be suboptimal in some cases:
```javascript
const {Lock, combine, sleep} = require('readers-writer-lock')

!async function(){
	let lock1 = new Lock()
	let lock2 = new Lock()


	let task1 = lock2.run(async function(){
		console.log('lock2 run start')
		await sleep(1000)
		console.log('lock2 run end')
	})
	let task2 = combine([lock1, lock2]).run(async function(){
		console.log('combined lock run start')
		await sleep(1000)
		console.log('combined lock run end')
	})
	let task3 = lock1.run(async function(){
		console.log('lock1 run start')
		await sleep(1000)
		console.log('lock1 run end')
	})
	await Promise.all([task1, task2, task3])
}()
```
Output:
```
lock2 run start
lock2 run end
combined lock run start
combined lock run end
lock1 run start
lock1 run end
```
The point to see here is that the "lock1 run" could have been finished by the time the "combined lock run" started, however lock1 was locked by the combined lock while it waited for lock2 to unlock. If you switch the creation order of the locks, the execution indeed becomes concurrent, because the combined lock tries to lock "lock2" first.
Output:
```
lock2 run start
lock1 run start
lock2 run end
lock1 run end
combined lock run start
combined lock run end
```

# Q&A:

## What is this useful for?

As an example, I use it for coordinating multiple rsync processes synchronizing a folder in an event driven application. Multiple outgoing synchronization processes can run concurrently, however when the folder itself is being updated from some remote location, the update needs to happen atomically.

## Hasn't this been done before?

Simple async mutexes have been done a lot of times. See for example: [lock](https://github.com/dominictarr/lock), [lock-queue](https://github.com/overlookmotel/lock-queue#readme), [lock-key](https://github.com/NathanLi/lock-key#readme), [mutex](https://github.com/ben-ng/mutex-js#readme), [mutex-js](https://github.com/danielglennross/mutex-js#readme), [mutexify](https://github.com/mafintosh/mutexify), [mutexlight](https://github.com/BuGlessRB/mutexlight#readme), [await-mutex](https://github.com/mgtitimoli/await-mutex#readme), [ts-mutex](https://github.com/LinusU/ts-mutex#readme)

Readers-writer locks are also available: [async-rwlock](https://github.com/mvisat/async-rwlock#readme), [rwlock](https://github.com/71104/rwlock), [rwlock-plus](https://github.com/jamietre/rwlock-plus#readme). However, this implementation is a bit simpler and doesn't need the locks to be explicitly released.

## Other features?

Other things that could be implemented, but aren't: read-preferring rwlock, lock upgrading and downgrading, locks with timeouts, option to explicitly release lock from the function, other concurrency constructs.
