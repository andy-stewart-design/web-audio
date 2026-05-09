// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

type Session =
	| { did: null; handle: null; displayName: null; avatar: null }
	| { did: string; handle: string; displayName: string | null; avatar: string | null };

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: Session;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { type Session };
