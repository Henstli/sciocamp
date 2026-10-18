"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19 po odeslání `<form action={…}>` formulář vymaže — i když server
 * vrátí chybu a uživatel by přišel o rozepsaný text. Tenhle handler odešle
 * formulář přes stejnou akci, ale bez automatického vymazání.
 *
 *   <form onSubmit={keepForm(formAction)}>
 */
export function keepForm(dispatch: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
}
