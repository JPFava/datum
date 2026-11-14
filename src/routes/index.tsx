import { createFileRoute } from "@tanstack/react-router";
import { DatumApp } from "@/components/datum/DatumApp";

export const Route = createFileRoute("/")({ component: DatumApp });
