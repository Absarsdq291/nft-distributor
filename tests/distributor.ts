import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Distributor } from "../target/types/distributor";
import {NftCt} from "../target/types/nft_ct";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import BN from "bn.js";
import {
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Keypair,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";

describe("distributor", () => {
  // Set up the provider to interact with the local network
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Distributor as Program<Distributor>;
  const nftCtProgram = anchor.workspace.NftCt as Program<NftCt>;

  it("Mints an NFT", async () => {
    // Metadata for the NFT
    const id = new BN(35);
    const name = "Cat NFT";
    const symbol = "EMB";
    const uri = "https://gateway.irys.xyz/7Ce5hD2HdMzkSNJCp5u5Xe1y27qjZSWsyGjia3J7Gisd";
    let amount = new BN(0.01 * anchor.web3.LAMPORTS_PER_SOL);

    const provider = program.provider as anchor.AnchorProvider;
    const payer = provider.wallet as anchor.Wallet;

    // Create the distributor pda address
    const [distributor] = await PublicKey.findProgramAddress(
      [
        Buffer.from("distributor")
      ],
      program.programId                   
    );

    // Create the mint address
    const [mint] = await PublicKey.findProgramAddress(
      [
        Buffer.from("mint"),               // First seed: "mint"
        id.toArrayLike(Buffer, "le", 8)    // Second seed: id.to_le_bytes() (little-endian 8 bytes)
      ],
      nftCtProgram.programId                    // Program ID
    );

    // Get the associated token account address for the payer
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      payer.publicKey, 
    );

    const [metadataPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    const [masterEditionPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    console.log(
      "\nMint:", mint.toBase58(),
      "\nMetadata:", metadataPDA.toBase58(),
      "\nMasterEdition:", masterEditionPDA.toBase58(),
      "\nTokenAccount:", tokenAccount.toBase58(),
      "\nPayer:", payer.publicKey.toBase58(),
      "\nMetadataProgram:", new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBase58(),
      "\nDistributor:", distributor.toBase58(), "\n"
    );

    // Call the mint function from the distributor program
    try{
        const tx = new Transaction();
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
        tx.add(await program.methods
            .invokeCreateNft(id, name, symbol, uri, amount)
            .accounts({
                authority: payer.publicKey,
                payer: payer.publicKey,
                mint: mint,
                distributor: distributor,
                tokenAccount: tokenAccount,
                nftMetadata: metadataPDA,
                masterEditionAccount: masterEditionPDA,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                metadataProgram: new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID),
                systemProgram: anchor.web3.SystemProgram.programId,
                nftCtProgram: nftCtProgram.programId
            })
            .instruction()
          )
          
          const signature = await anchor.web3.sendAndConfirmTransaction(
            program.provider.connection,
            tx,
            [payer.payer] // Signers for the transaction
        );

      console.log("Transaction Signature:", signature);
      const mintedAccount = await program.provider.connection.getParsedAccountInfo(mint);
      assert.ok(mintedAccount.value !== null, "Mint account should exist after minting.");
    }catch(error){
      console.error("Transaction failed:", error);
      assert.fail("Transaction failed.");
    }
  });

  it("Fails to mint an NFT when called directly instead of through the distributor program", async () => {
    // Metadata for the NFT
    const id = new BN(40);
    const name = "Cat NFT";
    const symbol = "EMB";
    const uri = "https://gateway.irys.xyz/7Ce5hD2HdMzkSNJCp5u5Xe1y27qjZSWsyGjia3J7Gisd";

    const provider = program.provider as anchor.AnchorProvider;
    const payer = provider.wallet as anchor.Wallet;

    // Create the mint address
    const [mint] = await PublicKey.findProgramAddress(
      [
        Buffer.from("mint"),               // First seed: "mint"
        id.toArrayLike(Buffer, "le", 8)    // Second seed: id.to_le_bytes() (little-endian 8 bytes)
      ],
      nftCtProgram.programId                    // Program ID
    );

    // Get the associated token account address for the payer
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      payer.publicKey, 
    );

    const [metadataPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    const [masterEditionPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    console.log(
      "\nMint:", mint.toBase58(),
      "\nMetadata:", metadataPDA.toBase58(),
      "\nMasterEdition:", masterEditionPDA.toBase58(),
      "\nTokenAccount:", tokenAccount.toBase58(),
      "\nPayer:", payer.publicKey.toBase58(),
      "\nMetadataProgram:", new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBase58(), "\n"
    );

    try {
      // Call the mint function from the nft program
      const tx = await nftCtProgram.methods
      .createSingleNft(id, name, symbol, uri)
      .accounts({
        authority: payer.publicKey,
        payer: payer.publicKey,
        mint: mint,
        instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenAccount: tokenAccount,
        nftMetadata: metadataPDA,
        masterEditionAccount: masterEditionPDA,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        metadataProgram: new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

      assert.fail("The transaction was expected to fail with an error 'unauthorized error', but it succeeded.");

    } 
    catch(err){
      //console.log(err);
      assert.equal(err.error.errorMessage, "Unauthorized access", "Error message should be 'Unauthorized access'");
    }
  });

  it("Fails to mint an NFT when SOL amount less than 0.01 is provided", async () => {
    // Metadata for the NFT
    const id = new BN(40);
    const name = "Cat NFT";
    const symbol = "EMB";
    const uri = "https://gateway.irys.xyz/7Ce5hD2HdMzkSNJCp5u5Xe1y27qjZSWsyGjia3J7Gisd";
    let amount = new BN(0.001 * anchor.web3.LAMPORTS_PER_SOL);

    const provider = program.provider as anchor.AnchorProvider;
    const payer = provider.wallet as anchor.Wallet;

    // Create the distributor pda address
    const [distributor] = await PublicKey.findProgramAddress(
      [
        Buffer.from("distributor")
      ],
      program.programId                   
    );

    // Create the mint address
    const [mint] = await PublicKey.findProgramAddress(
      [
        Buffer.from("mint"),               // First seed: "mint"
        id.toArrayLike(Buffer, "le", 8)    // Second seed: id.to_le_bytes() (little-endian 8 bytes)
      ],
      nftCtProgram.programId                    // Program ID
    );

    // Get the associated token account address for the payer
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      payer.publicKey, 
    );

    const [metadataPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    const [masterEditionPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    console.log(
      "\nMint:", mint.toBase58(),
      "\nMetadata:", metadataPDA.toBase58(),
      "\nMasterEdition:", masterEditionPDA.toBase58(),
      "\nTokenAccount:", tokenAccount.toBase58(),
      "\nPayer:", payer.publicKey.toBase58(),
      "\nMetadataProgram:", new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBase58(),
      "\nDistributor:", distributor.toBase58(), "\n"
    );

    // Call the mint function from the distributor program
    try{
      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
      tx.add(await program.methods
          .invokeCreateNft(id, name, symbol, uri, amount)
          .accounts({
              authority: payer.publicKey,
              payer: payer.publicKey,
              mint: mint,
              distributor: distributor,
              tokenAccount: tokenAccount,
              nftMetadata: metadataPDA,
              masterEditionAccount: masterEditionPDA,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
              tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
              metadataProgram: new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID),
              systemProgram: anchor.web3.SystemProgram.programId,
              nftCtProgram: nftCtProgram.programId
          })
          .instruction()
        )
        
      await anchor.web3.sendAndConfirmTransaction(
          program.provider.connection,
          tx,
          [payer.payer] // Signers for the transaction
      );

      assert.fail("The transaction was expected to fail with an error 'insufficient amount', but it succeeded.");
    }
    catch(err){
      //console.log(err);
      const errorMessage = err.logs.find(log => log.includes("insufficient amount"));
      assert.isTrue(errorMessage !== undefined, "Error message 'insufficient amount' should be in the logs.");
    }
  });

  it("Fails when balance is insufficient", async () => {
    const payer = Keypair.generate();

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    try {
      const signature = await connection.requestAirdrop(
        payer.publicKey,
        0.001 * anchor.web3.LAMPORTS_PER_SOL 
      );
    
      // Wait for the transaction to be confirmed
      await connection.confirmTransaction(signature);
      console.log("Airdrop successful!");
    } catch (err) {
      console.log("Airdrop failed:", err);
    }

    const balance = await connection.getBalance(payer.publicKey);
    console.log(`Payer balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    // Metadata for the NFT
    const id = new BN(40);
    const name = "Cat NFT";
    const symbol = "EMB";
    const uri = "https://gateway.irys.xyz/7Ce5hD2HdMzkSNJCp5u5Xe1y27qjZSWsyGjia3J7Gisd";
    let amount = new BN(0.01 * anchor.web3.LAMPORTS_PER_SOL);

    const provider = program.provider as anchor.AnchorProvider;
    
    // Create the distributor pda address
    const [distributor] = await PublicKey.findProgramAddress(
      [
        Buffer.from("distributor")
      ],
      program.programId                   
    );

    // Create the mint address
    const [mint] = await PublicKey.findProgramAddress(
      [
        Buffer.from("mint"),               // First seed: "mint"
        id.toArrayLike(Buffer, "le", 8)    // Second seed: id.to_le_bytes() (little-endian 8 bytes)
      ],
      nftCtProgram.programId                    // Program ID
    );

    // Get the associated token account address for the payer
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      payer.publicKey, 
    );

    const [metadataPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    const [masterEditionPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
    );

    console.log(
      "\nMint:", mint.toBase58(),
      "\nMetadata:", metadataPDA.toBase58(),
      "\nMasterEdition:", masterEditionPDA.toBase58(),
      "\nTokenAccount:", tokenAccount.toBase58(),
      "\nPayer:", payer.publicKey.toBase58(),
      "\nMetadataProgram:", new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBase58(),
      "\nDistributor:", distributor.toBase58(), "\n"
    );

    // Call the mint function from the distributor program
    try{
        const tx = new Transaction();
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
        tx.add(await program.methods
            .invokeCreateNft(id, name, symbol, uri, amount)
            .accounts({
                authority: payer.publicKey,
                payer: payer.publicKey,
                mint: mint,
                distributor: distributor,
                tokenAccount: tokenAccount,
                nftMetadata: metadataPDA,
                masterEditionAccount: masterEditionPDA,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                metadataProgram: new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID),
                systemProgram: anchor.web3.SystemProgram.programId,
                nftCtProgram: nftCtProgram.programId
            })
            .instruction()
          )
          
        await anchor.web3.sendAndConfirmTransaction(
            program.provider.connection,
            tx,
            [payer] // Signers for the transaction
        );

        assert.fail("The transaction was expected to fail with an error 'transfer failed', but it succeeded.");
    }
    catch(err){
      //console.log(err);
      const errorMessage = err.message.includes("Attempt to debit an account but found no record of a prior credit");
      const errorLogs = err.logs.find(log => log.includes("transfer failed") || log.includes("Transfer: insufficient lamports"));
      assert.isTrue(errorMessage === true || errorLogs !== undefined, "Error message 'transfer failed', 'Transfer: insufficient lamports' or 'Attempt to debit an account but found no record of a prior credit' should be in the logs.");
    }
  });

});