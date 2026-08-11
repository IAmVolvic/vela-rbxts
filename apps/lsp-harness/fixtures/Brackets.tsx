import React from "@rbxts/react";

const width = 120;

export const Brackets = () => (
	<>
		<frame className="hover:px-2 w-[calc(100% - 4px)] px-4" />
		<frame className="hover:px-2 w-[120px] px-4" />
		<frame className={`px-4 w-[${width}] hover:px-2`} />
	</>
);
