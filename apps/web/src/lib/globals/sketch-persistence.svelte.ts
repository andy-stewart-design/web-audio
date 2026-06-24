type PublishControls = {
	canPublish: () => boolean;
	publish: () => void;
};

class SketchPersistence {
	private controls = $state<PublishControls | null>(null);

	register(controls: PublishControls) {
		this.controls = controls;
		return () => {
			if (this.controls === controls) this.controls = null;
		};
	}

	get showPublish() {
		return Boolean(this.controls?.publish);
	}

	get canPublish() {
		return this.controls?.canPublish() ?? false;
	}

	publish() {
		this.controls?.publish();
	}
}

export const sketchPersistence = new SketchPersistence();
