'use strict'

const rwlock = require('./readers-writer-lock.js')

test('Lock locks execution, separate locks lock separately', async () => {
	let lockA = new rwlock.Lock()
	let lockB = new rwlock.Lock()
	
	let accum = []
	let tasks = []
	tasks.push(lockA.run(async function(){
		accum.push('lockA run1 begin')
		await rwlock.sleep(200)
		accum.push('lockA run1 end')
	}))
	tasks.push(lockA.run(async function(){
		accum.push('lockA run2 begin')
		await rwlock.sleep(200)
		accum.push('lockA run2 end')
	}))
	tasks.push(lockB.run(async function(){
		accum.push('lockB run1 begin')
		await rwlock.sleep(200)
		accum.push('lockB run1 end')
	}))
	tasks.push(lockB.run(async function(){
		accum.push('lockB run2 begin')
		await rwlock.sleep(200)
		accum.push('lockB run2 end')
	}))
	await Promise.all(tasks)
	expect(accum).toEqual([
		'lockA run1 begin',
		'lockB run1 begin',
		'lockA run1 end',
		'lockB run1 end',
		'lockA run2 begin',
		'lockB run2 begin',
		'lockA run2 end',
		'lockB run2 end',
	])
})

test('Combined locks wait for all used locks', async () => {
	let lockA = new rwlock.Lock()
	let lockB = new rwlock.Lock()
	let lockC = new rwlock.Lock()
	let tasks = []

	let current_exec_order = 0
	let exec_order = {}
	function register_exec(str){
		exec_order[str] = current_exec_order++
	}

	tasks.push(lockA.run(async function(){
		register_exec('a1 begin')
		await rwlock.sleep(200)
		register_exec('a1 end')
	}))
	tasks.push(lockA.run(async function(){
		register_exec('a2 begin')
		await rwlock.sleep(200)
		register_exec('a2 end')
	}))
	tasks.push(lockB.run(async function(){
		register_exec('b begin')
		await rwlock.sleep(200)
		register_exec('b end')
	}))
	tasks.push(rwlock.combine([lockA, lockB]).run(async function(){
		register_exec('AB begin')
		await rwlock.sleep(200)
		register_exec('AB end')
	}))
	tasks.push(rwlock.combine([lockB, lockC]).run(async function(){
		register_exec('BC begin')
		await rwlock.sleep(200)
		register_exec('BC end')
	}))
	tasks.push(rwlock.combine([lockC]).run(async function(){
		register_exec('C begin')
		await rwlock.sleep(200)
		register_exec('C end')
	}))
	tasks.push(rwlock.combine([lockA, lockB, lockC]).run(async function(){
		register_exec('ABC begin')
		await rwlock.sleep(200)
		register_exec('ABC end')
	}))
	tasks.push(rwlock.combine([]).run(async function(){
		register_exec('[] begin')
		await rwlock.sleep(200)
		register_exec('[] end')
	}))
	await Promise.all(tasks)
	let r1max = Math.max(...[
		exec_order['[] begin'],
		exec_order['a1 begin'],
		exec_order['b begin'],
		exec_order['C begin'],
	])
	let r2min = Math.min(...[
		exec_order['[] end'],
		exec_order['a1 end'],
		exec_order['b end'],
		exec_order['C end'],
	])
	let r2max = Math.max(...[
		exec_order['[] end'],
		exec_order['a1 end'],
		exec_order['b end'],
		exec_order['C end'],
	])
	expect(r1max).toBe(3)
	expect(r2min).toBe(4)
	expect(r2max).toBe(7)
	expect(exec_order['a2 begin']).toBe(8)
	expect(exec_order['BC begin']).toBe(9)
	expect(exec_order['a2 end']).toBe(10)
	expect(exec_order['BC end']).toBe(11)
	expect(exec_order['AB begin']).toBe(12)
	expect(exec_order['AB end']).toBe(13)
	expect(exec_order['ABC begin']).toBe(14)
	expect(exec_order['ABC end']).toBe(15)
})

test('RWLock locks for writes, runs readers simultanously', async () => {
	let lock = new rwlock.RWLock()

	let a = 0
	let tasks = []
	let accum = []
	async function read(){
		let local_a = a++
		accum.push('read started of ' + local_a)
		await rwlock.sleep(200)
		accum.push('read ended of ' + local_a)
	}
	async function write(){
		let local_a = a++
		accum.push('write started of ' + local_a)
		await rwlock.sleep(200)
		accum.push('write ended of ' + local_a)
	}
	let rw = new rwlock.RWLock()
	tasks.push(rw.read(read))
	tasks.push(rw.read(read))
	tasks.push(rw.read(read))
	tasks.push(rw.write(write))
	tasks.push(rw.write(write))
	tasks.push(rw.read(read))
	tasks.push(rw.read(read))
	tasks.push(rw.write(write))
	tasks.push(rw.read(read))
	tasks.push(rw.read(read))
	tasks.push(rw.write(write))
	await Promise.all(tasks)

	expect(accum).toEqual([
		'read started of 0',
		'read started of 1',
		'read started of 2',
		'read ended of 0',
		'read ended of 1',
		'read ended of 2',
		'write started of 3',
		'write ended of 3',
		'write started of 4',
		'write ended of 4',
		'read started of 5',
		'read started of 6',
		'read ended of 5',
		'read ended of 6',
		'write started of 7',
		'write ended of 7',
		'read started of 8',
		'read started of 9',
		'read ended of 8',
		'read ended of 9',
		'write started of 10',
		'write ended of 10',
	])
})

test('Lock unlocks even if method throws and re-throws exception', async () => {
	expect.assertions(3)

	let lock = new rwlock.Lock()	
	let unlocked = false
	let throw_run = lock.run(async function(){
		throw 42
	})
	let success_run = lock.run(async function(){
		unlocked = true
		return 43
	})
	try{
		await throw_run
	} catch(e) {
		expect(e).toEqual(42)
	}
	expect(await success_run).toEqual(43)
	expect(unlocked).toEqual(true)
})

test('CombinedLock unlocks even if method throws and re-throws exception', async () => {
	expect.assertions(5)

	let lockA = new rwlock.Lock()
	let lockB = new rwlock.Lock()
	let lockAB = rwlock.combine([lockA, lockB])
	let unlockedA = false
	let unlockedB = false
	let throw_run = lockAB.run(async function(){
		throw 42
	})
	let success_runA = lockA.run(async function(){
		unlockedA = true
		return 43
	})
	let success_runB = lockA.run(async function(){
		unlockedB = true
		return 44
	})
	try{
		await throw_run
	} catch(e) {
		expect(e).toEqual(42)
	}
	expect(await success_runA).toEqual(43)
	expect(await success_runB).toEqual(44)
	expect(unlockedA).toEqual(true)
	expect(unlockedB).toEqual(true)
})

test('RWLock unlocks even if method throws and re-throws exception', async () => {
	expect.assertions(8)

	let lock = new rwlock.RWLock()

	let run_read_2 = false
	let run_write_1 = false
	let run_read_3 = false
	let throw_run_1 = lock.read(async function(){
		throw 1
	})
	let success_run_1 = lock.read(async function(){
		run_read_2 = true
		return 1
	})
	let success_run_2 = lock.write(async function(){
		run_write_1 = true
		return 2
	})
	let throw_run_2 = lock.write(async function(){
		throw 2
	})
	let success_run_3 = lock.read(async function(){
		run_read_3 = true
		return 3
	})
	expect(await success_run_1).toEqual(1)
	expect(await success_run_2).toEqual(2)
	expect(await success_run_3).toEqual(3)
	expect(run_read_2).toEqual(true)
	expect(run_write_1).toEqual(true)
	expect(run_read_3).toEqual(true)
	try {
		await throw_run_1
	} catch(e) {
		expect(e).toEqual(1)
	}
	try {
		await throw_run_2
	} catch(e) {
		expect(e).toEqual(2)
	}
})